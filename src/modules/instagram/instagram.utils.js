import axios from 'axios';

const GRAPH_URL = 'https://graph.facebook.com/v25.0';

export const graphRequest = async (endpoint, params = {}) => {
    return await axios.get(`${GRAPH_URL}/${endpoint}`, {
        params: { access_token: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN, ...params }
    });
};

export const graphPost = async (endpoint, data) => {
    return await axios.post(`${GRAPH_URL}/${endpoint}`, {
        ...data,
        access_token: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN
    });
};