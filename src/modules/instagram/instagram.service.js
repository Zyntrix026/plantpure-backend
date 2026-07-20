import axios from "axios";
import respondConfig from "../../config/respond.config.js";

const api = axios.create({
    baseURL: respondConfig.baseURL,
    headers: {
        Authorization: `Bearer ${respondConfig.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
    },
});

class InstagramService {

    // Get Contact Details
async getContacts() {
    const { data } = await api.post("/contact/list", {
        search: "",
        filter: {
            $and: [],
        },
        timezone: "Asia/Kolkata",
    });

    return data;
}

    // Get Messages
    async getMessages(contactId) {
        const { data } = await api.get(
            `/contact/id:${contactId}/message/list`
        );

        return data;
    }

    // Send Message
    async sendMessage(contactId, channelId, text) {

        const { data } = await api.post(
            `/contact/id:${contactId}/message`,
            {
                channelId,
                message: {
                    type: "text",
                    text,
                },
            }
        );

        return data;
    }

}

export const getContacts = async () => {
    const { data } = await api.post("/contact/list", {
        search: "",
        filter: {
            $and: [],
        },
        timezone: "Asia/Kolkata",
    });
 
    return data;
};
export default new InstagramService();