#ifndef USER_H
#define USER_H

#include <string>

class User {
private:
    std::string firstName;
    std::string lastName;
    int age;
    std::string email;

public:
    // Constructor with 4 parameters
    User(const std::string& first, const std::string& last, int userAge, const std::string& userEmail);
    
    std::string getName() const;
    // Note: getFullName() method is NOT defined (intentional error)
    // Note: birthYear member does NOT exist (intentional error)
};

#endif // USER_H