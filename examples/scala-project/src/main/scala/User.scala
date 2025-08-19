// Scala project with intentional errors for LSP testing
import play.api.libs.json._
import akka.actor.typed.ActorSystem
import UndefinedImport._  // Error: undefined import

case class User(name: String, age: Int, email: Option[String] = None) {
  
  // Error: Using undefined method
  def getInfo: String = {
    s"$name is $age years old, city: $city"  // Error: undefined field city
  }
  
  // Error: Method returns wrong type
  def updateAge(newAge: Int): Boolean = {
    // Error: Case classes are immutable, can't modify fields
    age = newAge  // Error: reassignment to val
    this  // Error: returning User instead of Boolean
  }
  
  // Error: Pattern matching on wrong type
  def validateEmail(email: String): Boolean = email match {
    case s: String if s.contains("@") => 
      // Error: calling undefined method
      s.validateFormat()
      true
    case _ => false
  }
  
  // Error: Using undefined constant
  def getCategory: String = age match {
    case a if a < CHILD_MAX_AGE => "child"  // Error: undefined constant
    case a if a < ADULT_MAX_AGE => "adult"  // Error: undefined constant
    case _ => "senior"
  }
  
  // Error: Inconsistent return types in pattern match
  def isAdult: Any = age match {
    case a if a >= 18 => "yes"  // Should return Boolean
    case _ => false
  }
  
  // Error: Using Option incorrectly
  def getEmailDomain: String = {
    // Error: not handling None case properly
    email.get.split("@")(1)  // Error: potential NoSuchElementException
  }
  
  // Error: Calling undefined method on collection
  def processData(data: List[String]): List[String] = {
    // Error: undefined method on List
    data.transformAll(_.toUpperCase)
  }
}

object User {
  // Error: Using undefined implicit conversion
  implicit val userFormat: Format[User] = Json.format[User]
  
  // Error: Method signature doesn't match usage
  def apply(name: String): User = {
    // Error: using undefined variable
    User(name, defaultAge, None)
  }
  
  // Error: Using undefined type
  def fromJson(json: JsValue): UndefinedType = {
    // Error: not handling potential parsing errors
    json.as[User]
  }
  
  // Error: Method doesn't handle all cases
  def validateAge(age: Int): Boolean = age match {
    case a if a > 0 => true
    // Error: missing case for negative numbers and zero
  }
}