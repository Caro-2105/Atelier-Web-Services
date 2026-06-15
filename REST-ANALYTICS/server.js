const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const z = require("zod");

const app = express();
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// ==========================================
// SCHEMAS (Validation Zod)
// ==========================================

const BaseAnalyticsSchema = {
    source: z.string(),
    url: z.string(),
    visitor: z.string(),
    meta: z.record(z.any()).optional().default({}) 
};

const ViewSchema = z.object({
    ...BaseAnalyticsSchema
});

const ActionSchema = z.object({
    ...BaseAnalyticsSchema,
    action: z.string(),
});

const GoalSchema = z.object({
    ...BaseAnalyticsSchema,
    goal: z.string(),
});


// ==========================================
// ROUTES : /views
// ==========================================
app.post("/views", async (req, res) => {
    const result = ViewSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const document = { ...result.data, createdAt: new Date() };

    try {
        const ack = await db.collection("views").insertOne(document);
        res.status(201).send({ _id: ack.insertedId, ...document });
    } catch (error) {
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.get("/views", async (req, res) => {
    const views = await db.collection("views").find().toArray();
    res.send(views);
});

// ==========================================
// ROUTES : /actions
// ==========================================
app.post("/actions", async (req, res) => {
    const result = ActionSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const document = { ...result.data, createdAt: new Date() };

    try {
        const ack = await db.collection("actions").insertOne(document);
        res.status(201).send({ _id: ack.insertedId, ...document });
    } catch (error) {
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.get("/actions", async (req, res) => {
    const actions = await db.collection("actions").find().toArray();
    res.send(actions);
});

// ==========================================
// ROUTES : /goals
// ==========================================
app.post("/goals", async (req, res) => {
    const result = GoalSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const document = { ...result.data, createdAt: new Date() };

    try {
        const ack = await db.collection("goals").insertOne(document);
        res.status(201).send({ _id: ack.insertedId, ...document });
    } catch (error) {
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.get("/goals", async (req, res) => {
    const goals = await db.collection("goals").find().toArray();
    res.send(goals);
});



app.get("/goals/:goalId/details", async (req, res) => {
    try {
        const { goalId } = req.params;

        if (!ObjectId.isValid(goalId)) {
            return res.status(400).send({ message: "Format d'ID invalide" });
        }

        const result = await db.collection("goals").aggregate([
            { 
                $match: { _id: new ObjectId(goalId) } 
            },
            {
                $lookup: {
                    from: "views",
                    localField: "visitor",
                    foreignField: "visitor",
                    as: "visitorViews" 
                }
            },
            {
                $lookup: {
                    from: "actions",
                    localField: "visitor",
                    foreignField: "visitor",
                    as: "visitorActions"
                }
            }
        ]).toArray();

        if (result.length === 0) {
            return res.status(404).send({ message: "Objectif (Goal) introuvable" });
        }

        res.send(result[0]);

    } catch (error) {
        console.error("Erreur d'agrégation :", error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});




// ==========================================
// INITIALISATION
// ==========================================
client.connect().then(() => {
    db = client.db("analyticsDB"); 
    app.listen(port, () => {
        console.log(`Analytics API running on http://localhost:${port}`);
    });
}).catch(console.error);