const socket = io(); // connect to server

function sendMessage() {
  const input = document.getElementById("chat-input");
  const chatBox = document.getElementById("chat-box");

  if (input.value.trim() !== "") {
    const messageData = {
      username: username || "Anonymous", // use username if defined, otherwise fallback
      text: input.value
    };

    // send to server instead of only local
    socket.emit("chat message", messageData);

    input.value = "";
  }
}

// receive messages from server
socket.on("chat message", (data) => {
  const chatBox = document.getElementById("chat-box");

  const msg = document.createElement("div");
  msg.classList.add("message");
  msg.innerHTML = `${data.username}: ${data.text}`;
  msg.style.marginBottom = "8px";
  msg.style.background = "#ff0000ff";
  msg.style.padding = "5px";
  msg.style.borderRadius = "5px";

  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
});

// keep your emoji function
function indsætEmoji() {
  const select = document.getElementById("emoji-select");
  const emoji = select.value;
  const input = document.getElementById("chat-input");

  if (emoji !== "") {
    input.value += emoji;
    select.selectedIndex = 0; // Reset dropdown
    input.focus();
  }
}
