import express from 'express';
import { UserService } from './services/UserService';
import { DatabaseConnection } from './database/Connection';

// Intentional errors for testing - 10+ errors to test 5-item limit
const app = express();
const port: string = 3000; // Type error: should be number

// More intentional errors
const error1: number = "string1"; // Type error 1
const error2: boolean = 123; // Type error 2  
const error3: string = true; // Type error 3
const error4: number[] = "not an array"; // Type error 4
const error5: object = 456; // Type error 5

// Undefined variables
console.log(undefinedVar1); // Undefined 1
console.log(undefinedVar2); // Undefined 2
console.log(undefinedVar3); // Undefined 3

interface User {
  id: number;
  name: string;
  email: string;
}

class Server {
  private userService: UserService;
  
  constructor() {
    this.userService = new UserService();
    this.setupRoutes();
  }
  
  private setupRoutes(): void {
    app.get('/users', async (req, res) => {
      try {
        const users = await this.userService.getAllUsers();
        res.json(users);
      } catch (error) {
        console.log(unknownVariable); // Error: undefined variable
        res.status(500).json({ error: 'Internal server error' });
      }
    });
    
    app.get('/users/:id', async (req, res) => {
      const userId: string = req.params.id; // Should be number
      const user = await this.userService.getUserById(userId); // Type mismatch
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(user);
    });
  }
  
  public start(): void {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      this.nonExistentMethod(); // Error: method doesn't exist
    });
  }
}

const server = new Server();
server.start();// trigger change
const newError: string = 999; // New type error
