object Test {
  def main(args: Array[String]): Unit = {
    val x: String = 123  // Type error: Int to String
    println(undefinedVar)  // Undefined variable
    nonExistentMethod()  // Undefined method
  }
}