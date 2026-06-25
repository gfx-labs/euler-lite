# ── APIs ──────────────────────────────────────────────────────────────

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com",
  ])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# ── Artifact Registry ────────────────────────────────────────────────

resource "google_artifact_registry_repository" "euler_lite" {
  provider      = google
  location      = var.region
  repository_id = "euler-lite"
  format        = "DOCKER"
  description   = "Euler Lite Docker images"

  depends_on = [google_project_service.apis]
}

# ── Secret Manager ───────────────────────────────────────────────────

locals {
  secrets = [
    "RPC_URL_56",
    "APPKIT_PROJECT_ID",
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secrets)
  secret_id = each.value
  labels    = { app = "euler-lite" }

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ── Service Accounts ─────────────────────────────────────────────────

# Deploy SA: used by GitHub Actions to push images + deploy Cloud Run
resource "google_service_account" "github_deploy" {
  account_id   = "github-deploy"
  display_name = "GitHub Actions Deploy"
  description  = "Used by GitHub Actions to deploy to Cloud Run"

  depends_on = [google_project_service.apis]
}

# Runtime SA: used by the Cloud Run service at runtime
resource "google_service_account" "cloudrun_runtime" {
  account_id   = "cloudrun-runtime"
  display_name = "Cloud Run Runtime"
  description  = "Runtime identity for euler-lite Cloud Run service"

  depends_on = [google_project_service.apis]
}

# ── IAM: Deploy SA permissions ───────────────────────────────────────

resource "google_project_iam_member" "deploy_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_project_iam_member" "deploy_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_deploy.email}"
}

resource "google_service_account_iam_member" "deploy_acts_as_runtime" {
  service_account_id = google_service_account.cloudrun_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deploy.email}"
}

# ── IAM: Runtime SA can read secrets ─────────────────────────────────

resource "google_secret_manager_secret_iam_member" "runtime_reads_secret" {
  for_each  = toset(local.secrets)
  secret_id = google_secret_manager_secret.secrets[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloudrun_runtime.email}"
}

# ── Workload Identity Federation ─────────────────────────────────────

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"

  depends_on = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
  }

  attribute_condition = "assertion.repository_owner == '${var.github_org}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "wif_github_deploy" {
  service_account_id = google_service_account.github_deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# ── Cloud Run Service ────────────────────────────────────────────────

resource "google_cloud_run_v2_service" "euler_lite" {
  name     = "euler-lite"
  location = var.region

  # Prevent tofu from fighting with GHA deploys over the image tag.
  # GHA updates the image on every deploy; tofu manages everything else.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }

  template {
    service_account = google_service_account.cloudrun_runtime.email

    scaling {
      min_instance_count = var.cloud_run_min_instances
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      # Placeholder image — GHA will deploy the real one.
      # Using a valid public image so the initial create succeeds.
      image   = "us-docker.pkg.dev/cloudrun/container/hello"
      command = ["/nodejs/bin/node", ".output/server/index.mjs"]

      resources {
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
        cpu_idle          = true  # CPU only during requests (cheaper)
        startup_cpu_boost = true
      }

      ports {
        container_port = 3000
      }

      # Non-secret env vars
      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "NUXT_PUBLIC_CONFIG_APP_TITLE"
        value = "Poppie"
      }
      env {
        name  = "NUXT_PUBLIC_CONFIG_APP_DESCRIPTION"
        value = "Poppie Finance — Lending markets for Ondo tokenized assets"
      }
      env {
        name  = "SUBGRAPH_URL_56"
        value = "https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs/euler-simple-bsc/latest/gn"
      }

      # Secrets from Secret Manager
      env {
        name = "RPC_URL_56"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["RPC_URL_56"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "NUXT_PUBLIC_APP_KIT_PROJECT_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.secrets["APPKIT_PROJECT_ID"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.runtime_reads_secret,
  ]
}

# ── GitHub Environment ───────────────────────────────────────────────

resource "github_repository_environment" "production" {
  environment = "production"
  repository  = var.github_repo

  dynamic "reviewers" {
    for_each = var.github_reviewer_ids
    content {
      users = [reviewers.value]
    }
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "poppie_branch" {
  repository     = var.github_repo
  environment    = github_repository_environment.production.environment
  branch_pattern = "poppie"
}

resource "github_repository_environment_deployment_policy" "release_tags" {
  repository     = var.github_repo
  environment    = github_repository_environment.production.environment
  tag_pattern    = "v*"
}

# ── Outputs ──────────────────────────────────────────────────────────

output "wif_provider" {
  description = "Workload Identity Federation provider (for GHA workflow)"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_sa_email" {
  description = "Deploy service account email (for GHA workflow)"
  value       = google_service_account.github_deploy.email
}

output "image_registry" {
  description = "Artifact Registry image path prefix"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.euler_lite.repository_id}/euler-lite"
}

output "cloud_run_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.euler_lite.uri
}
