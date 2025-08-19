use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// Intentional errors for testing
#[derive(Debug, Serialize, Deserialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}

impl User {
    fn new(id: u32, name: String, email: String) -> Self {
        Self { id, name, email }
    }
    
    // Error: borrowing issue
    fn get_info(&self) -> String {
        let name = self.name; // Move instead of borrow
        format!("User: {} ({})", name, self.email)
    }
    
    // Error: lifetime issue
    fn get_name_ref(&self) -> &str {
        let temp = self.name.clone();
        &temp // Returning reference to local variable
    }
}

fn main() {
    // Error: undefined variable
    println!("Starting application version: {}", VERSION);
    
    let mut users: HashMap<u32, User> = HashMap::new();
    
    let user1 = User::new(1, "John".to_string(), "john@example.com".to_string());
    let user2 = User::new(2, "Jane".to_string(), "jane@example.com".to_string());
    
    users.insert(user1.id, user1);
    users.insert(user2.id, user2);
    
    // Error: use after move
    println!("User 1: {}", user1.get_info());
    
    // Error: type mismatch
    let user_count: String = users.len(); // Should be usize
    
    // Error: calling undefined function
    process_users(&users);
    
    // Error: wrong method call
    for (id, user) in users.iter() {
        println!("ID: {}, Info: {}", id, user.display()); // display() doesn't exist
    }
}