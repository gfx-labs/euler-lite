terraform {
  backend "gcs" {
    bucket = "ondo-poppie-prod-frontend-tfstate"
    prefix = "euler-lite"
  }
}
