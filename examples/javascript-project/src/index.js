import express from 'express';
import { UserController } from './controllers/UserController.js';
import { DatabaseService } from './services/DatabaseService.js';

// Intentional errors for testing - 10+ errors for diagnostic limit testing
const app = express();
const port = 3000;

// Multiple undefined variables (errors 1-8)
console.log(undefinedConfigVariable);
console.log(undefinedVar1);
console.log(undefinedVar2);
console.log(undefinedVar3);
console.log(undefinedVar4);
console.log(undefinedVar5);
console.log(undefinedVar6);
console.log(undefinedVar7);

// Syntax errors in JavaScript
const obj = {
  prop1: "value",
  prop2: "value",,  // Double comma syntax error
};

// More undefined references
nonExistentFunction1();
nonExistentFunction2();
nonExistentFunction3();

class App {
  constructor() {
    this.userController = new UserController();
    this.db = new DatabaseService();
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  setupMiddleware() {
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
  }
  
  setupRoutes() {
    app.get('/api/users', this.userController.getAllUsers);
    app.get('/api/users/:id', this.userController.getUserById);
    app.post('/api/users', this.userController.createUser);
    
    // Error: calling non-existent method
    app.get('/api/stats', this.userController.getStatistics());
  }
  
  async start() {
    try {
      await this.db.connect();
      app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        // Error: calling undefined function
        logServerStart();
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      // Error: accessing undefined property
      console.log(error.details.message);
    }
  }
}

const server = new App();
server.start();// test
