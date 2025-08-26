variable "region" { type = string  default = "us-east-1" }
variable "project" { type = string default = "react-prisma" }
variable "domain_name" { type = string }      # e.g., api.example.com
variable "spa_domain_name" { type = string }  # e.g., app.example.com
variable "db_username" { type = string }
variable "db_password" { type = string sensitive = true }
