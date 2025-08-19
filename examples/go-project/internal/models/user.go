package models

import "time"

type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// Error: receiver type mismatch
func (u *User) GetFullInfo() string {
	// Error: accessing undefined field
	return u.Name + " (" + u.Username + ")"
}

func (u User) IsValid() bool {
	// Error: wrong comparison type
	return len(u.Name) > 0 && u.ID == "valid"
}

// Error: undefined type in return
func CreateUser(name, email string) *InvalidUser {
	return &User{
		Name:      name,
		Email:     email,
		CreatedAt: time.Now(),
	}
}