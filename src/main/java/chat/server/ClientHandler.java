package chat.server;

import chat.protocol.Protocol;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.net.Socket;
import java.time.Instant;

public class ClientHandler extends Thread {
    private final Socket socket;
    private final ChatServer server;
    private DataInputStream in;
    private DataOutputStream out;
    private String username;

    public ClientHandler(Socket socket, ChatServer server) {
        this.socket = socket;
        this.server = server;
    }

    @Override
    public void run() {
        try {
            in = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
            out = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));

            if (!handleConnect()) {
                return;
            }

            String type;
            while ((type = in.readUTF()) != null) {
                if (Protocol.MSG.equals(type)) {
                    String message = in.readUTF();
                    server.broadcastMessage(username, message);
                } else if (Protocol.PM.equals(type)) {
                    String to = in.readUTF();
                    String message = in.readUTF();
                    server.sendPrivateMessage(username, to, message);
                } else if (Protocol.FILE.equals(type)) {
                    String to = in.readUTF();
                    String fileName = in.readUTF();
                    long size = in.readLong();
                    server.relayFile(username, to, fileName, size, this);
                }
            }
        } catch (IOException ignored) {
        } finally {
            close();
        }
    }

    private boolean handleConnect() throws IOException {
        String type = in.readUTF();
        if (!Protocol.CONNECT.equals(type)) {
            sendError("Invalid connect sequence");
            close();
            return false;
        }

        String requestedUsername = in.readUTF();
        if (requestedUsername == null || requestedUsername.trim().isEmpty()) {
            sendError("Username cannot be empty");
            close();
            return false;
        }

        if (!server.registerClient(requestedUsername, this)) {
            sendError("Username already in use");
            close();
            return false;
        }

        username = requestedUsername;
        sendWelcome("Welcome, " + username + "!");
        server.broadcastSystem(username + " joined the chat");
        server.broadcastUserList();
        return true;
    }

    public synchronized void sendMessage(String from, String message) {
        try {
            out.writeUTF(Protocol.MSG);
            out.writeUTF(from);
            out.writeUTF(message);
            out.writeLong(Instant.now().toEpochMilli());
            out.flush();
        } catch (IOException ignored) {
        }
    }

    public synchronized void sendPrivateMessage(String from, String message) {
        try {
            out.writeUTF(Protocol.PM);
            out.writeUTF(from);
            out.writeUTF(message);
            out.writeLong(Instant.now().toEpochMilli());
            out.flush();
        } catch (IOException ignored) {
        }
    }

    public synchronized void sendSystemMessage(String message) {
        try {
            out.writeUTF(Protocol.SYS);
            out.writeUTF(message);
            out.writeLong(Instant.now().toEpochMilli());
            out.flush();
        } catch (IOException ignored) {
        }
    }

    public synchronized void sendUserList(String[] users) {
        try {
            out.writeUTF(Protocol.USERS);
            out.writeInt(users.length);
            for (String user : users) {
                out.writeUTF(user);
            }
            out.flush();
        } catch (IOException ignored) {
        }
    }

    public void sendFile(String from, String fileName, long size, ClientHandler sender) throws IOException {
        synchronized (out) {
            out.writeUTF(Protocol.FILE);
            out.writeUTF(from);
            out.writeUTF(fileName);
            out.writeLong(size);
            out.flush();
            sender.pipeFileTo(out, size);
        }
    }

    public void pipeFileTo(DataOutputStream targetOut, long size) throws IOException {
        byte[] buffer = new byte[8192];
        long remaining = size;
        while (remaining > 0) {
            int read = in.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (read == -1) {
                break;
            }
            targetOut.write(buffer, 0, read);
            remaining -= read;
        }
        targetOut.flush();
    }

    public void discardFile(long size) throws IOException {
        byte[] buffer = new byte[8192];
        long remaining = size;
        while (remaining > 0) {
            int read = in.read(buffer, 0, (int) Math.min(buffer.length, remaining));
            if (read == -1) {
                break;
            }
            remaining -= read;
        }
    }

    private synchronized void sendWelcome(String message) throws IOException {
        out.writeUTF(Protocol.WELCOME);
        out.writeUTF(message);
        out.flush();
    }

    private synchronized void sendError(String message) throws IOException {
        out.writeUTF(Protocol.ERROR);
        out.writeUTF(message);
        out.flush();
    }

    private void close() {
        server.unregisterClient(username);
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }
}
