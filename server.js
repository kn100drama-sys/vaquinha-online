const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cors = require("cors");

const app = express();

app.use(express.json());

app.use(cors({
    origin: [
        "https://vaquinhagenesio.netlify.app"
    ]
}));

// =========================
// STORAGE
// =========================

const PAYMENTS_FILE = "./payments.json";

if (!fs.existsSync(PAYMENTS_FILE)) {
    fs.writeFileSync(PAYMENTS_FILE, "[]");
}

function readPayments() {
    try {
        return JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf8"));
    } catch {
        return [];
    }
}

function savePayment(payment) {
    try {
        const payments = readPayments();
        payments.push(payment);

        fs.writeFileSync(
            PAYMENTS_FILE,
            JSON.stringify(payments, null, 2)
        );
    } catch (err) {
        console.error("Erro salvando pagamento:", err);
    }
}

// =========================
// SUNIZE
// =========================

function getSunizeHeaders() {
    return {
        "x-api-key": process.env.SUNIZE_API_KEY,
        "x-api-secret": process.env.SUNIZE_API_SECRET,
        "Content-Type": "application/json"
    };
}

// =========================
// CREATE PIX
// =========================

app.post("/create-pix", async (req, res) => {

    try {

        console.log("=================================");
        console.log("📥 NOVA REQUISIÇÃO");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("=================================");

        // validações mínimas

        if (!req.body.customer?.name) {
            return res.status(400).json({
                error: "customer.name não enviado"
            });
        }

        if (!req.body.customer?.email) {
            return res.status(400).json({
                error: "customer.email não enviado"
            });
        }

        if (!req.body.total_amount) {
            return res.status(400).json({
                error: "total_amount não enviado"
            });
        }

        console.log("📤 ENVIANDO PARA SUNIZE");

        const response = await axios.post(
            "https://api.sunize.com.br/v1/transactions",
            req.body,
            {
                headers: getSunizeHeaders(),
                timeout: 20000
            }
        );

        const data = response.data;

        console.log("✅ RESPOSTA SUNIZE:");
        console.log(JSON.stringify(data, null, 2));

        savePayment({
            created_at: new Date().toISOString(),
            request: req.body,
            response: data
        });

        return res.json(data);

    } catch (err) {

        console.error("=================================");
        console.error("💥 ERRO SUNIZE");
        console.error("STATUS:", err.response?.status);
        console.error("DATA:", err.response?.data);
        console.error("MESSAGE:", err.message);
        console.error("=================================");

        return res.status(err.response?.status || 500).json({
            error: "Erro ao criar PIX",
            status: err.response?.status || 500,
            sunize_response: err.response?.data || null,
            message: err.message
        });
    }
});

// =========================
// PAYMENTS
// =========================

app.get("/payments", (req, res) => {
    res.json(readPayments());
});

// =========================
// HEALTH
// =========================

app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        server_time: new Date().toISOString(),
        hasApiKey: !!process.env.SUNIZE_API_KEY,
        hasApiSecret: !!process.env.SUNIZE_API_SECRET
    });
});

// =========================
// ROOT
// =========================

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "vaquinha-online"
    });
});

// =========================
// START
// =========================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
