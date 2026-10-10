import axios from "axios";
import { SERVER_URL } from "@/lib/constants";

const http = axios.create({
  baseURL: `${SERVER_URL}/api/campaigns`,
  withCredentials: true,
});
const data = (p) => p.then((r) => r.data);

export const campaignApi = {
  connections: () => data(http.get("/connections")),
  templates: (id) => data(http.get(`/connections/${id}/templates`)),
  previewRecipients: (body) => data(http.post("/preview-recipients", body)),
  previewMessage: (body) => data(http.post("/preview-message", body)),
  create: (body) => data(http.post("/", body)),
  list: () => data(http.get("/", { params: { limit: 100 } })),
  get: (id) => data(http.get(`/${id}`)),
  config: (id) => data(http.get(`/${id}/config`)),
  update: (id, body) => data(http.post(`/${id}/update`, body)),
  recipients: (id, params) => data(http.get(`/${id}/recipients`, { params })),
  launch: (id, body) => data(http.post(`/${id}/launch`, body)),
  action: (id, name) => data(http.post(`/${id}/${name}`)),
  report: (id) => data(http.get(`/${id}/report`)),
  reportCsv: (id) =>
    http.get(`/${id}/report`, { params: { format: "csv" }, responseType: "blob" }).then((r) => r.data),
};

export const STATUS_TONE = {
  draft: "neutral",
  running: "sky",
  paused: "amber",
  completed: "green",
  cancelled: "neutral",
  failed: "red",
  pending: "neutral",
  queued: "sky",
  sent: "sky",
  delivered: "green",
  read: "purple",
  skipped: "amber",
};
