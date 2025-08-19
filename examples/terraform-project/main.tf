# Real Terraform project with intentional errors
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Error: undefined variable
resource "aws_vpc" "main" {
  cidr_block           = var.undefined_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "main-vpc"
    # Error: wrong interpolation syntax
    Environment = "${var.environment}"
  }
}

# Error: invalid resource type
resource "aws_invalid_resource" "test" {
  name = "test-resource"
}

# Error: missing required argument
resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id
  # Missing cidr_block
  
  # Error: wrong attribute name
  available_zone = "us-west-2a"
  
  tags = {
    Name = "public-subnet"
  }
}

# Error: referencing non-existent resource
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.nonexistent.id
  
  tags = {
    Name = "main-igw"
  }
}