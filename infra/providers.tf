terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    # Fill in with your state bucket details
    bucket = "CHANGE_ME-tf-state-bucket"
    key    = "react-prisma/stage/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "CHANGE_ME-tf-locks"
    encrypt = true
  }
}

provider "aws" {
  region = var.region
}
