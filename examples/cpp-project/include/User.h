#pragma once
#include <string>

class User {
private:
    std::string firstName;
    std::string lastName;
    int age;
    std::string email;

public:
    // Constructor
    User(const std::string& first, const std::string& last, int userAge, const std::string& userEmail);
    
    // Copy constructor with error
    User(const User& other);
    
    // Destructor
    ~User();
    
    // Getters
    std::string getName() const;
    std::string getEmail() const;
    int getAge() const;
    
    // Error: declaration mismatch with implementation
    void setAge(float newAge);
    
    // Error: missing const qualifier
    std::string getFullName();
    
    // Static method with error
    static User createDefaultUser();
};