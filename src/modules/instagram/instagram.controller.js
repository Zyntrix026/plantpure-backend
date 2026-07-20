import instagramService from "./instagram.service.js";

export const getContacts = async (req, res) => {
    try {

        const data = await instagramService.getContacts();

        res.json(data);

    } catch (err) {

        console.log(err.response?.data || err.message);

        res.status(500).json(err.response?.data || err.message);

    }
};
export const getMessages = async (req, res) => {
    try {

        console.log("Contact ID:", req.params.contactId);

        const data = await instagramService.getMessages(
            req.params.contactId
        );

        console.log("Respond.io Response:");
        console.log(JSON.stringify(data, null, 2));

        res.json(data);

    } catch (err) {
        console.log("ERROR:", err.response?.data || err.message);

        res.status(500).json(err.response?.data || err.message);
    }
};

export const sendMessage = async (req, res) => {

    try {

        const { contactId, channelId, text } = req.body;

        const data = await instagramService.sendMessage(
            contactId,
            channelId,
            text
        );

        res.json(data);

    } catch (err) {

        res.status(500).json(err.response?.data || err.message);

    }

};

