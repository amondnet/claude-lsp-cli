#include "User.h"
#include <sstream>

User::User(const std::string& first, const std::string& last, int userAge, const std::string& userEmail)
    : firstName(first), lastName(last), age(userAge), email(userEmail) {
    // Error: accessing undefined member
    this->id = generateId(); // id doesn't exist in class
}

User::User(const User& other) 
    : firstName(other.firstName), lastName(other.lastName), age(other.age) {
    // Error: missing email in copy constructor
    // email is not copied
}

User::~User() {
    // Error: trying to delete non-pointer member
    delete firstName; // firstName is not a pointer
}

std::string User::getName() const {
    return firstName;
}

std::string User::getEmail() const {
    return email;
}

int User::getAge() const {
    return age;
}

// Error: parameter type mismatch with declaration
void User::setAge(int newAge) { // Declaration says float
    if (newAge < 0) {
        // Error: accessing undefined member
        this->isValid = false;
    }
    age = newAge;
}

// Error: missing const qualifier (declared as non-const)
std::string User::getFullName() const {
    return firstName + " " + lastName;
}

// Error: return type mismatch
int User::createDefaultUser() { // Should return User
    return User("Default", "User", 0, "default@example.com");
}