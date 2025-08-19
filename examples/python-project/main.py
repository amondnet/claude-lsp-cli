#!/usr/bin/env python3
"""
Python project with intentional errors for LSP testing
"""

from typing import List, Dict
import requests  # This import might not exist
import undefined_module  # Error: undefined import

def calculate_average(numbers: List[int]) -> float:
    """Calculate average of numbers with intentional errors"""
    # Error: Division by zero potential
    return sum(numbers) / len(numbers)

def process_user_data(data: Dict[str, str]) -> str:
    """Process user data with type errors"""
    # Error: Type mismatch - expecting str but got int
    user_id: str = data.get("id", 0)
    
    # Error: Missing key handling
    name = data["name"]  # KeyError if 'name' doesn't exist
    
    # Error: Using undefined variable
    return f"User {name} has ID {user_id} and email {email}"

class User:
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
    
    def get_info(self) -> str:
        # Error: Accessing undefined attribute
        return f"{self.name} is {self.height} years old"
    
    def birthday(self):
        # Error: No return type annotation for non-void function
        self.age += 1
        return self.age

def main():
    # Error: Wrong argument types
    numbers = ["1", "2", "3"]  # Should be List[int]
    avg = calculate_average(numbers)
    
    # Error: Missing required arguments
    user = User("Alice")
    
    # Error: Calling undefined method
    user.send_email("test@example.com")
    
    # Error: Undefined variable
    print(f"Average: {avg}, User: {undefined_var}")

if __name__ == "__main__":
    main()