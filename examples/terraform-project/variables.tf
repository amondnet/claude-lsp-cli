# Variables with errors
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name"
  # Error: invalid type
  type = invalid_string_type
  default = "dev"
}

# Error: missing type
variable "instance_count" {
  description = "Number of instances"
  default = 2
}

# Error: wrong validation syntax
variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
  
  validation {
    # Error: wrong condition syntax
    condition = var.instance_type in ["t3.micro", "t3.small"]
    error_message = "Instance type must be t3.micro or t3.small."
  }
}