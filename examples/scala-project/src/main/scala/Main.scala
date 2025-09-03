// Scala example with intentional errors - no external dependencies

case class User(name: String, age: Int)

object Main extends App {
  def main(args: Array[String]): Unit = {
    // Error: wrong number of arguments to case class constructor
    val user1 = User("Alice", 25, "extra_param")
    
    // Error: calling undefined method on case class
    user1.setName("Alice Smith")
    
    // Error: wrong argument type - expecting Int, got String
    val user2 = User("Bob", "twenty-five")
    
    // Error: using undefined variable
    println(s"Total users: $totalCount")
    
    // Error: calling method on undefined object
    undefinedUser.getName
    
    // Error: undefined variables in list
    val users = List(user1, user2, user3, user4)  // user3, user4 undefined
    
    // Error: calling undefined method on List
    users.processAll(_.name)
    
    // Error: pattern matching with undefined extractor
    user1 match {
      case UndefinedExtractor(name, age) => println(s"$name is $age")
      case _ => println("Unknown user")
    }
    
    // Error: accessing undefined object
    UndefinedObject.processUser(user1)
    
    // Error: wrong method call - User doesn't have getInfo method
    println(user1.getInfo)
    
    // Error: type mismatch in assignment
    val count: String = users.length  // Int assigned to String
  }
  
  // Error: undefined parameter type
  def processUsers(users: List[User], config: UndefinedConfig): Unit = {
    users.foreach(user => user.process(config))  // Error: User doesn't have process method
  }
}