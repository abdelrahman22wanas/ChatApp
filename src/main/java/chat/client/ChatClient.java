package chat.client;

import chat.protocol.Protocol;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

public class ChatClient {
    public interface Listener {
        void onMessage(String from, String message, Instant timestamp);
        void onPrivateMessage(String from, String message, Instant timestamp);
        void onSystemMessage(String message, Instant timestamp);
        void onUsersUpdate(String[] users);
        void onFileReceived(String from, String fileName, Path savedPath, long size);
        void onError(String message);
    }

    private final String host;
    private final int port;
    private final String username;
    private final Listener listener;

    private Socket socket;
    private DataInputStream in;
    private DataOutputStream out;

    public ChatClient(String host, int port, String username, Listener listener) {
        this.host = host;
        this.port = port;
        this.username = username;
        this.listener = listener;
    }

    public void connect() throws IOException {
        socket = new Socket(host, port);
        in = new DataInputStream(new BufferedInputStream(socket.getInputStream()));
        out = new DataOutputStream(new BufferedOutputStream(socket.getOutputStream()));

        out.writeUTF(Protocol.CONNECT);
        out.writeUTF(username);
        out.flush();

        String response = in.readUTF();
        if (Protocol.ERROR.equals(response)) {
            String message = in.readUTF();
            throw new IOException(message);
        } else if (Protocol.WELCOME.equals(response)) {
            in.readUTF();
        }

        Thread listenerThread = new Thread(this::listen, "ChatClientListener");
        listenerThread.setDaemon(true);
        listenerThread.start();
    }

    public void sendMessage(String message) throws IOException {
        synchronized (out) {
            out.writeUTF(Protocol.MSG);
            out.writeUTF(message);
            out.flush();
        }
    }

    public void sendPrivateMessage(String to, String message) throws IOException {
        synchronized (out) {
            out.writeUTF(Protocol.PM);
            out.writeUTF(to);
            out.writeUTF(message);
            out.flush();
        }
    }

    public void sendFile(String to, Path path) throws IOException {
        long size = Files.size(path);
        String fileName = path.getFileName().toString();
        synchronized (out) {
            out.writeUTF(Protocol.FILE);
            out.writeUTF(to);
            out.writeUTF(fileName);
            out.writeLong(size);
            try (FileInputStream fileIn = new FileInputStream(path.toFile())) {
                byte[] buffer = new byte[8192];
                long remaining = size;
                while (remaining > 0) {
                    int read = fileIn.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                    if (read == -1) {
                        break;
                    }
                    out.write(buffer, 0, read);
                    remaining -= read;
                }
            }
            out.flush();
        }
    }

    private void listen() {
        try {
            while (true) {
                String type = in.readUTF();
                if (Protocol.MSG.equals(type)) {
                    String from = in.readUTF();
                    String message = in.readUTF();
                    Instant ts = Instant.ofEpochMilli(in.readLong());
                    listener.onMessage(from, message, ts);
                } else if (Protocol.PM.equals(type)) {
                    String from = in.readUTF();
                    String message = in.readUTF();
                    Instant ts = Instant.ofEpochMilli(in.readLong());
                    listener.onPrivateMessage(from, message, ts);
                } else if (Protocol.SYS.equals(type)) {
                    String message = in.readUTF();
                    Instant ts = Instant.ofEpochMilli(in.readLong());
                    listener.onSystemMessage(message, ts);
                } else if (Protocol.USERS.equals(type)) {
                    int count = in.readInt();
                    String[] users = new String[count];
                    for (int i = 0; i < count; i++) {
                        users[i] = in.readUTF();
                    }
                    listener.onUsersUpdate(users);
                } else if (Protocol.FILE.equals(type)) {
                    String from = in.readUTF();
                    String fileName = in.readUTF();
                    long size = in.readLong();
                    Path savedPath = saveIncomingFile(fileName, size);
                    listener.onFileReceived(from, fileName, savedPath, size);
                }
            }
        } catch (IOException e) {
            listener.onError("Disconnected: " + e.getMessage());
        }
    }

    private Path saveIncomingFile(String fileName, long size) throws IOException {
        Path downloadDir = Path.of(System.getProperty("user.home"), "Downloads", "ChatApp");
        Files.createDirectories(downloadDir);
        Path destination = downloadDir.resolve(System.currentTimeMillis() + "_" + fileName);

        try (var output = Files.newOutputStream(destination)) {
            byte[] buffer = new byte[8192];
            long remaining = size;
            while (remaining > 0) {
                int read = in.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read == -1) {
                    break;
                }
                output.write(buffer, 0, read);
                remaining -= read;
            }
        }
        return destination;
    }

    public void close() {
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }
}
