#include <iostream>
#include <vector>
#include <memory>
#include "User.h"
#include "Database.h"

// Intentional errors for testing
int main() {
    // Error: undefined variable
    std::cout << "Starting application: " << undefinedVersion << std::endl;
    
    // Type error: wrong type assignment
    std::string port = 8080; // Should be int
    
    Database db;
    
    // Error: calling non-existent method
    if (!db.initialize()) {
        std::cerr << "Failed to initialize database" << std::endl;
        return 1;
    }
    
    std::vector<User> users;
    
    // Error: wrong constructor parameters
    User user1("John", "Doe", 25, "invalid@email"); // Missing parameter
    User user2("Jane", "Smith"); // Too few parameters
    
    users.push_back(user1);
    users.push_back(user2);
    
    // Error: accessing non-existent member
    for (const auto& user : users) {
        std::cout << "User: " << user.getFullName() 
                  << ", Age: " << user.birthYear << std::endl; // Wrong member name
    }
    
    // Memory error: using deleted pointer
    auto userPtr = std::make_unique<User>("Test", "User", 30, "test@example.com");
    delete userPtr.get(); // Wrong way to delete unique_ptr
    std::cout << userPtr->getName() << std::endl; // Use after delete
    
    return 0;
}