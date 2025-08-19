package handlers

import (
	"encoding/json"
	"net/http"
	"go-real-test/internal/models"
)

type UserHandler struct {
	users []models.User
}

func NewUserHandler() *UserHandler {
	return &UserHandler{
		users: make([]models.User, 0),
	}
}

func (h *UserHandler) GetUsers(w http.ResponseWriter, r *http.Request) {
	// Type error: wrong method signature
	w.Header().Set("Content-Type", "application/json")
	
	// Error: accessing undefined field
	for _, user := range h.users {
		user.FullName = user.FirstName + " " + user.LastName
	}
	
	// Error: undefined function
	response := PrepareResponse(h.users)
	json.NewEncoder(w).Encode(response)
}

func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var user models.User
	
	if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	// Error: assigning wrong type
	user.ID = "invalid-id-type" // Should be int
	
	h.users = append(h.users, user)
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}