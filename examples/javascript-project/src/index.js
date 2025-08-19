import express from 'express';
import { UserController } from './controllers/UserController.js';
import { DatabaseService } from './services/DatabaseService.js';

// Intentional errors for testing
const app = express();
const port = 3000;

// Error: accessing undefined variable
console.log(undefinedConfigVariable);

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
server.start();