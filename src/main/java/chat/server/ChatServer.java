package chat.server;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ChatServer {
    private final int port;
    private final Map<String, ClientHandler> clients = new ConcurrentHashMap<>();

    public ChatServer(int port) {
        this.port = port;
    }

    public void start() throws IOException {
        try (ServerSocket serverSocket = new ServerSocket(port)) {
            System.out.println("Chat server started on port " + port);
            while (true) {
                Socket socket = serverSocket.accept();
                ClientHandler handler = new ClientHandler(socket, this);
                handler.start();
            }
        }
    }

    public boolean registerClient(String username, ClientHandler handler) {
        return clients.putIfAbsent(username, handler) == null;
    }

    public void unregisterClient(String username) {
        if (username != null) {
            clients.remove(username);
            broadcastSystem(username + " left the chat");
            broadcastUserList();
        }
    }

    public void broadcastMessage(String from, String message) {
        clients.values().forEach(client -> client.sendMessage(from, message));
    }

    public void sendPrivateMessage(String from, String to, String message) {
        ClientHandler target = clients.get(to);
        if (target != null) {
            target.sendPrivateMessage(from, message);
        } else {
            ClientHandler sender = clients.get(from);
            if (sender != null) {
                sender.sendSystemMessage("User not found: " + to);
            }
        }
    }

    public void broadcastSystem(String message) {
        clients.values().forEach(client -> client.sendSystemMessage(message));
    }

    public void broadcastUserList() {
        String[] users = clients.keySet().toArray(new String[0]);
        clients.values().forEach(client -> client.sendUserList(users));
    }

    public void relayFile(String from, String to, String fileName, long size, ClientHandler sender) throws IOException {
        ClientHandler target = clients.get(to);
        if (target != null) {
            target.sendFile(from, fileName, size, sender);
        } else {
            sender.discardFile(size);
            sender.sendSystemMessage("User not found for file: " + to);
        }
    }

    public static void main(String[] args) {
        int port = 12345;
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {
            }
        }

        try {
            new ChatServer(port).start();
        } catch (IOException e) {
            System.err.println("Failed to start server: " + e.getMessage());
        }
    }
}
