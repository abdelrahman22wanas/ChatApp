# Java Chat Application (Client–Server)

A real-time client–server chat app built with Java sockets, multithreading, and Swing UI.

## Features
- Multi-client chat with broadcast messages (client-server sockets)
- Private messaging (`/pm username message`)
- Online users list with join/leave updates
- File transfer (`/file username path` or Send File button)
- JavaFX client UI with CSS styling
- Optional Swing UI client (`ChatUI`)
- Emoji support via Unicode input

## Project Structure
```
ChatApp/
├── src/
│   └── main/
│       ├── java/
│       │   └── chat/
│       │       ├── client/
│       │       │   ├── ChatClient.java
│       │       │   ├── ChatFxApp.java
│       │       │   ├── ChatUI.java
│       │       │   └── PromptDialogs.java
│       │       │
│       │       ├── model/
│       │       │   └── Message.java
│       │       │
│       │       ├── protocol/
│       │       │   └── Protocol.java
│       │       │
│       │       └── server/
│       │           ├── ChatServer.java
│       │           └── ClientHandler.java
│       │
│       └── resources/
│           └── chat/
│               └── client/
│                   └── chatfx.css
```

## Run (Maven)
1. Open a terminal in the ChatApp folder.
2. (Optional) Build:
```
mvn -q -DskipTests package
```
3. Start server:
```
mvn -q exec:java -Dexec.mainClass=chat.server.ChatServer
```
4. Start JavaFX client UI (in another terminal):
```
mvn -q javafx:run -Djavafx.args=""
```

### Windows (PowerShell) notes
- If `mvn` is not in PATH, run with the full Maven path:
```
& "C:\Program Files\apache-maven-3.9.12\bin\mvn.cmd" -q -f "D:\PROJECTS\CHAT-System\ChatApp\pom.xml" exec:java "-Dexec.mainClass=chat.server.ChatServer"
```
```
& "C:\Program Files\apache-maven-3.9.12\bin\mvn.cmd" -q -f "D:\PROJECTS\CHAT-System\ChatApp\pom.xml" javafx:run '-Djavafx.args=""'
```
- Make sure the server is running before the JavaFX client connects (defaults: `localhost` / `12345`).

## JavaFX UI (recommended)
JavaFX is handled by Maven dependencies; no manual FX_PATH is needed.

## Swing UI (optional)
```
mvn -q exec:java -Dexec.mainClass=chat.client.ChatUI
```

If `mvn` is not in PATH, use:
```
"C:\Program Files\apache-maven-3.9.12\bin\mvn.cmd" -q -DskipTests package
```

## Commands
- `/pm username message`
- `/file username path`

## Notes
- Received files are saved to `%USERPROFILE%\Downloads\ChatApp`.
