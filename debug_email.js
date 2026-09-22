function debugEmailPayload() {
  try {
    var response = Gmail.Users.Threads.list('me', { q: 'from:jim22087000@gmail.com', maxResults: 1 });
    if (response.threads && response.threads.length > 0) {
      var threadDetail = Gmail.Users.Threads.get('me', response.threads[0].id);
      var msg = threadDetail.messages[threadDetail.messages.length - 1];
      console.log("【PAYLOAD JSON】" + JSON.stringify(msg.payload));
    } else {
      console.log("No thread found");
    }
  } catch(e) {
    console.log("Error:" + e.toString());
  }
}
