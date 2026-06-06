// server.js
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());

// 🔥 CORS (corrigido pra não quebrar Netlify com / no final)
app.use(cors({
    origin: function (origin, callback) {
        const allowed = [
            "https://vaquinhagenesio.netlify.app",
            "https://vaquinhagenesio.netlify.app/"
        ];

        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS bloqueado: " + origin));
        }
    }
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
    } catch (err) {
        console.error("❌ Erro leitura payments:", err.message);
        return [];
    }
}

function savePayment(payment) {
    try {
        const data = readPayments();
        data.push(payment);
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("❌ Erro ao salvar pagamento:", err.message);
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

// =========================
// 🔥 HEADERS SUNIZE
// =========================
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
    console.log("📥 Nova requisição /create-pix:", req.body);

    try {
        const { name, email, phone, amount, description } = req.body;

        // validação forte
        if (!name) {
            return res.status(400).json({ error: "Nome obrigatório" });
        }

        if (!amount || amount < 5) {
            return res.status(400).json({ error: "Valor mínimo é R$ 5" });
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
            ip: (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1"),
            customer: {
                name,
                email,
                phone: formatPhone(phone),
                document_type: "CPF",
                document: "00000000000"
            }
        };

        console.log("📦 Payload enviado Sunize:", JSON.stringify(payload, null, 2));

        const response = await axios.post(
            "https://api.sunize.com.br/v1/transactions",
            payload,
            {
                headers: getSunizeHeaders(),
                timeout: 15000
            }
        );

        const data = response.data;

        if (!data || !data.pix) {
            console.error("❌ Sunize sem PIX:", data);
            return res.status(500).json({
                error: "Sunize não retornou PIX",
                raw: data
            });
        }

        savePayment({
            id: data.id,
            external_id: data.external_id,
            status: data.status,
            amount: data.total_value,
            customer: payload.customer,
            pix: data.pix,
            created_at: new Date().toISOString()
        });

        return res.json({
            id: data.id,
            external_id: data.external_id,
            status: data.status,
            total_value: data.total_value,
            pix: data.pix,
            customer: data.customer
        });

    } catch (err) {
        console.error("💥 ERRO COMPLETO:");
        console.error(err.response?.data || err.message);

        return res.status(err.response?.status || 500).json({
            error: "Erro ao criar pagamento",
            details: err.response?.data || err.message
        });
    }
});

// =========================
// 📦 PAYMENTS
// =========================
app.get("/payments", (req, res) => {
    res.json(readPayments());
});

// =========================
// 💚 HEALTH
// =========================
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        time: new Date().toISOString()
    });
});

// =========================
// 🚀 START
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
