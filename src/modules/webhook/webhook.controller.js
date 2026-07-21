export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN
  ) {
    // console.log("Webhook Verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  const body = req.body;

  // console.log(JSON.stringify(body, null, 2));

  if (body.object === "page") {
    // console.log("Facebook Message");
    // Facebook handle
  }

  if (body.object === "instagram") {
    // console.log("Instagram Message");
    // Instagram handle
  }

  res.sendStatus(200);
};