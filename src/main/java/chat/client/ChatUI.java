package chat.client;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JList;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.SwingUtilities;
import javax.swing.WindowConstants;
import javax.swing.filechooser.FileNameExtensionFilter;
import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.event.ActionListener;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

public class ChatUI extends JFrame implements ChatClient.Listener {
    private final JTextArea chatArea = new JTextArea();
    private final JTextField inputField = new JTextField();
    private final JButton sendButton = new JButton("Send");
    private final JButton fileButton = new JButton("Send File");
    private final JList<String> userList = new JList<>();

    private ChatClient client;
    private final DateTimeFormatter timeFormatter = DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault());

    public ChatUI() {
        super("Java Chat Application");
        setDefaultCloseOperation(WindowConstants.EXIT_ON_CLOSE);
        setSize(900, 600);
        setLocationRelativeTo(null);

        chatArea.setEditable(false);
        chatArea.setLineWrap(true);
        chatArea.setWrapStyleWord(true);

        JPanel inputPanel = new JPanel(new BorderLayout(8, 8));
        inputPanel.setBorder(BorderFactory.createEmptyBorder(8, 8, 8, 8));
        inputPanel.add(inputField, BorderLayout.CENTER);

        JPanel buttonPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT, 8, 0));
        buttonPanel.add(fileButton);
        buttonPanel.add(sendButton);
        inputPanel.add(buttonPanel, BorderLayout.EAST);

        JPanel sidePanel = new JPanel(new BorderLayout());
        sidePanel.setPreferredSize(new Dimension(200, 0));
        sidePanel.add(new JLabel("Online Users"), BorderLayout.NORTH);
        sidePanel.add(new JScrollPane(userList), BorderLayout.CENTER);

        add(new JScrollPane(chatArea), BorderLayout.CENTER);
        add(inputPanel, BorderLayout.SOUTH);
        add(sidePanel, BorderLayout.EAST);

        ActionListener sendAction = e -> sendMessage();
        sendButton.addActionListener(sendAction);
        inputField.addActionListener(sendAction);
        fileButton.addActionListener(e -> sendFile());

        connect();
    }

    private void connect() {
        String host = JOptionPane.showInputDialog(this, "Server host", "localhost");
        if (host == null || host.isBlank()) {
            host = "localhost";
        }
        String portStr = JOptionPane.showInputDialog(this, "Server port", "12345");
        int port = 12345;
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException ignored) {
        }
        String username = JOptionPane.showInputDialog(this, "Choose a username");
        if (username == null || username.isBlank()) {
            username = "User" + System.currentTimeMillis();
        }

        try {
            client = new ChatClient(host, port, username, this);
            client.connect();
            appendSystem("Connected as " + username);
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this, "Failed to connect: " + e.getMessage());
            System.exit(0);
        }
    }

    private void sendMessage() {
        String text = inputField.getText().trim();
        if (text.isEmpty()) {
            return;
        }
        inputField.setText("");

        if (text.startsWith("/pm ")) {
            String[] parts = text.split(" ", 3);
            if (parts.length < 3) {
                appendSystem("Usage: /pm username message");
                return;
            }
            try {
                client.sendPrivateMessage(parts[1], parts[2]);
            } catch (Exception e) {
                appendSystem("Failed to send private message: " + e.getMessage());
            }
            return;
        }

        if (text.startsWith("/file ")) {
            String[] parts = text.split(" ", 3);
            if (parts.length < 3) {
                appendSystem("Usage: /file username path");
                return;
            }
            Path path = Path.of(parts[2]);
            try {
                client.sendFile(parts[1], path);
                appendSystem("File sent to " + parts[1] + ": " + path.getFileName());
            } catch (Exception e) {
                appendSystem("Failed to send file: " + e.getMessage());
            }
            return;
        }

        try {
            client.sendMessage(text);
        } catch (Exception e) {
            appendSystem("Failed to send message: " + e.getMessage());
        }
    }

    private void sendFile() {
        String target = userList.getSelectedValue();
        if (target == null || target.isBlank()) {
            target = JOptionPane.showInputDialog(this, "Send file to username");
        }
        if (target == null || target.isBlank()) {
            return;
        }

        var chooser = new javax.swing.JFileChooser();
        chooser.setDialogTitle("Select a file to send");
        chooser.setFileFilter(new FileNameExtensionFilter("All files", "*"));
        int result = chooser.showOpenDialog(this);
        if (result != javax.swing.JFileChooser.APPROVE_OPTION) {
            return;
        }

        Path path = chooser.getSelectedFile().toPath();
        try {
            client.sendFile(target, path);
            appendSystem("File sent to " + target + ": " + path.getFileName());
        } catch (Exception e) {
            appendSystem("Failed to send file: " + e.getMessage());
        }
    }

    private void appendMessage(String prefix, String message, Instant timestamp) {
        String time = timeFormatter.format(timestamp);
        chatArea.append("[" + time + "] " + prefix + " " + message + "\n");
        chatArea.setCaretPosition(chatArea.getDocument().getLength());
    }

    private void appendSystem(String message) {
        appendMessage("[System]", message, Instant.now());
    }

    @Override
    public void onMessage(String from, String message, Instant timestamp) {
        SwingUtilities.invokeLater(() -> appendMessage("[" + from + "]", message, timestamp));
    }

    @Override
    public void onPrivateMessage(String from, String message, Instant timestamp) {
        SwingUtilities.invokeLater(() -> appendMessage("[PM from " + from + "]", message, timestamp));
    }

    @Override
    public void onSystemMessage(String message, Instant timestamp) {
        SwingUtilities.invokeLater(() -> appendMessage("[System]", message, timestamp));
    }

    @Override
    public void onUsersUpdate(String[] users) {
        SwingUtilities.invokeLater(() -> userList.setListData(users));
    }

    @Override
    public void onFileReceived(String from, String fileName, Path savedPath, long size) {
        SwingUtilities.invokeLater(() -> appendSystem("Received file from " + from + ": " + fileName + " (" + size + " bytes). Saved to " + savedPath));
    }

    @Override
    public void onError(String message) {
        SwingUtilities.invokeLater(() -> appendSystem(message));
    }

    public static void main(String[] args) {
        ChatFxApp.main(args);
    }
}
