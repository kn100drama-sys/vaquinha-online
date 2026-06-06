// server.js
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());

app.use(cors({
    origin: "https://vaquinhagenesio.netlify.app/" // seu frontend
}));

const PAYMENTS_FILE = "./payments.json";

// =========================
// 📦 STORAGE LOCAL
// =========================
if (!fs.existsSync(PAYMENTS_FILE)) {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([]));
}

function readPayments() {
    try {
        const raw = fs.readFileSync(PAYMENTS_FILE, "utf8");
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePayment(payment) {
    try {
        const data = readPayments();
        data.push(payment);
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Erro ao salvar pagamento:", err.message);
    }
}

// =========================
// 🔐 VALIDADORES
// =========================
function isValidEmail(email) {
    return typeof email === "string" && email.includes("@");
}

function formatPhone(phone) {
    if (!phone) return "+5511999999999";
    let cleaned = phone.replace(/\D/g, "");
    if (!cleaned.startsWith("55")) cleaned = "55" + cleaned;
    return "+" + cleaned;
}

function safeDocument(doc, type) {
    const cleaned = (doc || "").replace(/\D/g, "");
    if ((type === "CPF" && cleaned.length === 11) || (type === "CNPJ" && cleaned.length === 14)) {
        return cleaned;
    }
    return type === "CPF" ? "00000000000" : "00000000000000";
}

function getSunizeHeaders() {
    return {
        "x-api-key": process.env.SUNIZE_API_KEY,
        "x-api-secret": process.env.SUNIZE_API_SECRET,
        "Content-Type": "application/json"
    };
}

// =========================
// 🔥 CREATE PIX
// =========================
app.post("/create-pix", async (req, res) => {
    try {
        const { name, email, phone, amount, description } = req.body;

        if (!name || !amount) {
            return res.status(400).json({ error: "Nome e valor são obrigatórios" });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: "Email inválido" });
        }

        const payload = {
            external_id: "doacao_" + Date.now(),
            total_amount: Number(amount),
            payment_method: "PIX",
            items: [{
                id: "1",
                title: "Doação - Ajude o Genésio",
                description: description || "Doação via vaquinha",
                price: Number(amount),
                quantity: 1,
                is_physical: false
            }],
            ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1",
            customer: {
                name,
                email,
                phone: formatPhone(phone),
                document_type: "CPF",
                document: "00000000000"
            }
        };

        const response = await axios.post(
            "https://api.sunize.com.br/v1/transactions",
            payload,
            { headers: getSunizeHeaders(), timeout: 15000 }
        );

        const data = response.data;

        savePayment({
            id: data.id,
            external_id: data.external_id,
            status: data.status,
            amount: data.total_value,
            customer: payload.customer,
            pix: data.pix,
            created_at: new Date().toISOString()
        });

        res.json({
            id: data.id,
            external_id: data.external_id,
            status: data.status,
            total_value: data.total_value,
            pix: data.pix,
            customer: data.customer
        });

    } catch (err) {
        console.error("Erro Sunize:", err.response?.data || err.message);
        res.status(err.response?.status || 500).json({
            error: err.response?.data?.message || "Erro ao criar pagamento",
            details: err.response?.data || null
        });
    }
});

// =========================
// 📦 CONSULTA LOCAL DE PAGAMENTOS
// =========================
app.get("/payments", (req, res) => {
    res.json(readPayments());
});

// =========================
// 💚 HEALTH CHECK
// =========================
app.get("/health", (req, res) => {
    res.json({ status: "OK", time: new Date().toISOString() });
});

// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
