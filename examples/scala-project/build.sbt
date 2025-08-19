ThisBuild / version := "0.1.0-SNAPSHOT"
ThisBuild / scalaVersion := "3.3.0"

lazy val root = (project in file("."))
  .settings(
    name := "scala-lsp-test",
    libraryDependencies ++= Seq(
      "org.scalactic" %% "scalactic" % "3.2.16",
      "org.scalatest" %% "scalatest" % "3.2.16" % "test",
      "com.typesafe.akka" %% "akka-actor-typed" % "2.8.0",
      "com.typesafe.play" %% "play-json" % "2.10.0"
    )
  )