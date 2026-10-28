terraform {
  required_version = ">= 1.10"

  backend "s3" {
    bucket       = "restaurant-terraform-state-435362778950-sz"
    key          = "restaurant/terraform.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
    encrypt      = true
  }
}
