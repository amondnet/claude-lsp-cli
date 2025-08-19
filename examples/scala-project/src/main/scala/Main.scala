import akka.actor.typed.ActorSystem
import akka.actor.typed.scaladsl.Behaviors
import UndefinedLibrary._  // Error: undefined import

object Main extends App {
  // Error: using undefined variable
  implicit val system: ActorSystem[Nothing] = ActorSystem(Behaviors.empty, systemName)
  
  def main(args: Array[String]): Unit = {
    // Error: wrong number of arguments to apply method
    val user1 = User("Alice", 25, "extra_param")
    
    // Error: calling undefined method
    user1.setName("Alice Smith")
    
    // Error: wrong argument type
    user1.updateAge("twenty-five")
    
    // Error: using undefined variable
    println(s"Total users: $totalCount")
    
    // Error: calling method on undefined object
    undefinedUser.getInfo
    
    // Error: using undefined collection method
    val users = List(user1, user2, user3)  // Error: user2, user3 undefined
    users.processAll(_.getInfo)  // Error: undefined method
    
    // Error: pattern matching with undefined extractor
    user1 match {
      case UndefinedExtractor(name, age) => println(s"$name is $age")
      case _ => println("Unknown user")
    }
    
    // Error: accessing undefined object method
    UndefinedObject.processUser(user1)
    
    println(user1.getInfo)
    
    // Error: not terminating actor system
  }
  
  // Error: method signature doesn't match call
  def processUsers(users: List[User], config: Config): Unit = {
    // Error: undefined type Config and calling undefined method
    users.foreach(user => user.process(config))
  }
}