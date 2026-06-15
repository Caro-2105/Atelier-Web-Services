const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const z = require("zod");
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const port = 8000;
const client = new MongoClient("mongodb://localhost:27017");
let db;

app.use(express.json());

// ==========================================
// SCHEMAS
// ==========================================

const ProductSchema = z.object({
    _id: z.string(),
    name: z.string(),
    about: z.string(),
    price: z.number().positive(),
    categoryIds: z.array(z.string())
});
const CreateProductSchema = ProductSchema.omit({ _id: true });

const CategorySchema = z.object({
    _id: z.string(),
    name: z.string(),
});
const CreateCategorySchema = CategorySchema.omit({ _id: true });


// ==========================================
// ROUTES REST
// ==========================================

app.get("/products", async (req, res) => {
    try {
        const result = await db
            .collection("products")
            .aggregate([
                { $match: {} },
                {
                    $lookup: {
                        from: "categories",
                        localField: "categoryIds",
                        foreignField: "_id",
                        as: "categories",
                    },
                },
            ])
            .toArray();

        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Erreur serveur" });
    }
});

app.post("/products", async (req, res) => {
    const result = await CreateProductSchema.safeParse(req.body);

    if (result.success) {
        const { name, about, price, categoryIds } = result.data;
        const categoryObjectIds = categoryIds.map((id) => new ObjectId(id));

        try {
            const ack = await db
                .collection("products")
                .insertOne({ name, about, price, categoryIds: categoryObjectIds });

            res.send({
                _id: ack.insertedId,
                name,
                about,
                price,
                categoryIds: categoryObjectIds,
            });
        } catch (error) {
             res.status(500).send({ message: "Erreur lors de la création du produit" });
        }
    } else {
        res.status(400).send(result);
    }
});

app.post("/categories", async (req, res) => {
    const result = await CreateCategorySchema.safeParse(req.body);

    if (result.success) {
        const { name } = result.data;
        try {
            const ack = await db.collection("categories").insertOne({ name });
            res.send({ _id: ack.insertedId, name });
        } catch(error) {
             res.status(500).send({ message: "Erreur lors de la création de la catégorie" });
        }
    } else {
        res.status(400).send(result);
    }
});

// ==========================================
// WEB SOCKETS (Le Chat Temps Réel)
// ==========================================

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Un utilisateur s\'est connecté');

  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('Un utilisateur s\'est déconnecté');
  });
});

// ==========================================
// SERVER INIT
// ==========================================

client.connect().then(() => {
    db = client.db("myDB");
    server.listen(port, "0.0.0.0", () => {
        console.log(`Serveur en ligne sur http://localhost:${port}`);
    });
}).catch(console.error);