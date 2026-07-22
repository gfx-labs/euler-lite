variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "ondo-poppie-prod"
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "github_org" {
  description = "GitHub organization that owns the repo"
  type        = string
  default     = "gfx-labs"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "euler-lite"
}

variable "github_reviewer_ids" {
  description = "GitHub user IDs required to approve production deploys"
  type        = list(number)
  default     = [2260857] # elee1766
}

variable "app_url" {
  description = "Production URL for CORS and og:url"
  type        = string
  default     = "https://poppie.io"
}

variable "lb_domains" {
  description = "Domains for the Google-managed SSL certificate"
  type        = list(string)
  default     = ["poppie.io", "www.poppie.io"]
}

variable "ga_measurement_id" {
  description = "Google Analytics measurement ID (e.g. G-XXXXXXXXXX). Empty = no injection."
  type        = string
  default     = "G-S1E7DXE8E1"
}

variable "cloud_run_min_instances" {
  description = "Minimum Cloud Run instances (1 keeps warm cache alive)"
  type        = number
  default     = 1
}

variable "cloud_run_max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 3
}

variable "cloud_run_cpu" {
  description = "CPU allocation for Cloud Run"
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Memory allocation for Cloud Run"
  type        = string
  default     = "512Mi"
}
