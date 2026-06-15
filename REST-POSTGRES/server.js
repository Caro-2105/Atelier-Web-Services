const express = require("express");
const postgres = require("postgres");
const z = require("zod");
const crypto = require("crypto");

const { fetch, ProxyAgent } = require('undici');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const proxyAgent = new ProxyAgent('http://localhost:9000');

const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
const port = 8000;
const sql = postgres('postgres://user:password@localhost:5433/mydb');

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API E-Commerce Gaming',
            version: '1.0.0',
            description: 'Documentation de l\'API (Produits, Utilisateurs, Commandes, Avis)',
        },
        servers: [
            {
                url: 'http://localhost:8000',
                description: 'Serveur local de développement'
            },
        ],
    },
    apis: ['./server.js', './docs/*.js'], 
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(express.json());

function hashPassword(password) {
    return crypto.createHash('sha512').update(password).digest('hex');
}





// Schemas

//produits
const ProductSchema = z.object({
    id: z.string(),
    name: z.string(),
    about: z.string(),
     price: z.number().positive(),
});
const CreateProductSchema = ProductSchema.omit({ id: true });


app.post("/products", async (req, res) => {
    const result = await CreateProductSchema.safeParse(req.body);

    // If Zod parsed successfully the request body
    if (result.success) {
        const { name, about, price } = result.data;

        const product = await sql`
        INSERT INTO products (name, about, price)
        VALUES (${name}, ${about}, ${price})
        RETURNING *
        `;

        res.send(product[0]);
    } else {
        res.status(400).send(result);
    }
});


app.delete("/products/:id", async (req, res) => {
    const product = await sql`
        DELETE FROM products
        WHERE id=${req.params.id}
        RETURNING *
        `;

    if (product.length > 0) {
        res.send(product[0]);
    } else {
        res.status(404).send({ message: "Not found" });
    }
});


	
app.get("/products", async (req, res) => {
    const { name, about, price } = req.query;

    try {                                                                     //Exercice 3 pour la recherche de produits avec filtres
        const products = await sql`
            SELECT * FROM products
            WHERE 1=1
            ${name ? sql`AND name ILIKE ${'%' + name + '%'}` : sql``}
            ${about ? sql`AND about ILIKE ${'%' + about + '%'}` : sql``}
            ${price ? sql`AND price <= ${price}` : sql``}
        `;
        
        res.send(products);

    } catch (error) {
        console.error("Erreur de base de données:", error);
        res.status(500).send({ message: "Erreur lors de la recherche des produits" });
    }
});

	
app.get("/products/:id", async (req, res) => {
    try {
        const product = await sql`
            SELECT 
                p.*,
                -- On récupère tous les avis liés à ce produit sous forme de tableau JSON
                (
                    SELECT COALESCE(json_agg(r), '[]'::json)
                    FROM reviews r
                    WHERE r.product_id = p.id
                ) AS reviews
            FROM products p
            WHERE p.id = ${req.params.id}
        `;
        
        if (product.length > 0) {
            res.send(product[0]);
        } else {
            res.status(404).send({ message: "Produit non trouvé" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});








// users 
const UserSchema = z.object({
    id: z.number().or(z.string()),
    username: z.string(),
    email: z.string().email(),
    password: z.string().min(4),
});

const CreateOrUpdateUserSchema = UserSchema.omit({ id: true });
const PatchUserSchema = CreateOrUpdateUserSchema.partial();

app.get("/users", async (req, res) => {
    const users = await sql`
        SELECT * FROM users
        `;
    
    res.send(users);
});


app.post("/users", async (req, res) => {
    const result = await CreateOrUpdateUserSchema.safeParse(req.body);

    if (result.success) {
        const { username, email, password } = result.data;
        const hashedPassword = hashPassword(password);

        const user = await sql`
        INSERT INTO users (username, email, password)
        VALUES (${username}, ${email}, ${hashedPassword})
        RETURNING *
        `;

        const userResponse = { ...user[0] };
        delete userResponse.password; 
        
        res.status(201).send(userResponse);
    } else {
        res.status(400).send(result);
    }
});


app.put("/users/:id", async (req, res) => {
    const result = await CreateOrUpdateUserSchema.safeParse(req.body);

    if (result.success) {
        const { username, email, password } = result.data;
        const hashedPassword = hashPassword(password);

        const user = await sql`
        UPDATE users
        SET username = ${username}, email = ${email}, password = ${hashedPassword}
        WHERE id = ${req.params.id}
        RETURNING *
        `;

        if (user.length > 0) {
        const userResponse = { ...user[0] };
        delete userResponse.password; 
        res.send(userResponse);
        } else {
        res.status(404).send({ message: "User not found" });
        }
    } else {
        res.status(400).send(result);
    }
});


app.patch("/users/:id", async (req, res) => {
    const result = await PatchUserSchema.safeParse(req.body);

    if (result.success) {
        const updates = result.data;

        if (Object.keys(updates).length === 0) {
        return res.status(400).send({ message: "No data provided for update" });
        }

        if (updates.password) {
        updates.password = hashPassword(updates.password);
        }

        const user = await sql`
        UPDATE users
        SET ${sql(updates)}
        WHERE id = ${req.params.id}
        RETURNING *
        `;

        if (user.length > 0) {
        const userResponse = { ...user[0] };
        delete userResponse.password; 
        res.send(userResponse);
        } else {
        res.status(404).send({ message: "User not found" });
        }
    } else {
        res.status(400).send(result);
    }
});



// ==========================================
// EXERCICE 2 :  API FREETOGAME
// ==========================================

app.get("/f2p-games", async (req, res) => {
  try {
    const response = await fetch("https://www.freetogame.com/api/games", {          //j'ai des soucis avec les APIs externes à cause du proxy du boulot...
      dispatcher: proxyAgent,                                                       //donc je n'ai pas pu tester via postman (403)
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
      }
    });
    
    if (!response.ok) {
        console.error(`Erreur de l'API externe: ${response.status} ${response.message}`);
      return res.status(response.status).send({ message: `Erreur de l'API externe: ${response.status}` });

    }

    const games = await response.json();
    res.send(games);

  } catch (error) {
    console.error("Erreur Fetch:", error);
    res.status(500).send({ message: "Erreur serveur lors de la communication externe" });
  }
});


app.get("/f2p-games/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const response = await fetch("https://www.freetogame.com/api/games", {
      dispatcher: proxyAgent, 
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
      }
    });

    if (!response.ok) {
      return res.status(response.status).send({ message: `Jeu non trouvé sur l'API externe: ${response.status}` });
    }

    const game = await response.json();
    res.send(game);

  } catch (error) {
    console.error("Erreur Fetch:", error);
    res.status(500).send({ message: "Erreur serveur lors de la communication externe" });
  }
});



// ==========================================
// EXERCICE 4 : SYSTÈME DE PANIER (ORDERS)
// ==========================================

const CreateOrderSchema = z.object({
    userId: z.number().or(z.string().transform(Number)),
    productIds: z.array(z.number().or(z.string().transform(Number))).nonempty()
});

const UpdateOrderSchema = z.object({
    productIds: z.array(z.number().or(z.string().transform(Number))).nonempty().optional(),
    payment: z.boolean().optional()
});


async function calculateTotal(productIds) {
    let rawTotal = 0;
    for (const pid of productIds) {
        const product = await sql`SELECT price FROM products WHERE id = ${pid}`;
        if (product.length === 0) {
            throw new Error(`Le produit avec l'id ${pid} n'existe pas.`);
        }
        rawTotal += product[0].price;
    }
    return rawTotal * 1.2;
}




app.post("/orders", async (req, res) => {
    const result = CreateOrderSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const { userId, productIds } = result.data;

    try {
        const user = await sql`SELECT id FROM users WHERE id = ${userId}`;
        if (user.length === 0) return res.status(404).send({ message: "Utilisateur introuvable" });

        const total = await calculateTotal(productIds);

        const order = await sql`
            INSERT INTO orders (user_id, product_ids, total)
            VALUES (${userId}, ${productIds}, ${total})
            RETURNING *
        `;
        
        res.status(201).send(order[0]);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});



app.get("/orders", async (req, res) => {
    try {
        const enrichedOrders = await sql`
            SELECT 
                o.id, 
                o.total, 
                o.payment, 
                o.created_at AS "createdAt", 
                o.updated_at AS "updatedAt",
                
                json_build_object(
                    'id', u.id, 
                    'username', u.username, 
                    'email', u.email
                ) AS user,
                
                (
                    SELECT COALESCE(json_agg(p), '[]'::json)
                    FROM unnest(o.product_ids) AS pid
                    JOIN products p ON p.id = pid
                ) AS products

            FROM orders o
            JOIN users u ON o.user_id = u.id
        `;

        res.send(enrichedOrders);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Erreur serveur" });
    }
});




app.get("/orders/:id", async (req, res) => {
    try {
        const order = await sql`SELECT * FROM orders WHERE id = ${req.params.id}`;
        
        if (order.length === 0) return res.status(404).send({ message: "Commande introuvable" });

        const user = await sql`SELECT id, username, email FROM users WHERE id = ${order[0].user_id}`;
        const products = [];
        for (const pid of order[0].product_ids) {
            const prod = await sql`SELECT * FROM products WHERE id = ${pid}`;
            if (prod.length > 0) products.push(prod[0]);
        }

        res.send({
            id: order[0].id,
            total: order[0].total,
            payment: order[0].payment,
            createdAt: order[0].created_at,
            updatedAt: order[0].updated_at,
            user: user[0],
            products: products
        });
    } catch (error) {res.status(500).send({ message: "Erreur serveur" });}
});



app.patch("/orders/:id", async (req, res) => {
    const result = UpdateOrderSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const updates = result.data;
    if (Object.keys(updates).length === 0) return res.status(400).send({ message: "pas de données" });

    try {
        if (updates.productIds) {
            updates.total = await calculateTotal(updates.productIds);
            updates.product_ids = updates.productIds;
            delete updates.productIds; 
        }

        updates.updated_at = new Date();

        const order = await sql`
            UPDATE orders
            SET ${sql(updates)}
            WHERE id = ${req.params.id}
            RETURNING *
        `;

        if (order.length > 0) {
            res.send(order[0]);
        } else {
            res.status(404).send({ message: "Commande introuvable" });
        }
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});




app.delete("/orders/:id", async (req, res) => {
    try {
        const order = await sql`
            DELETE FROM orders
            WHERE id = ${req.params.id}
            RETURNING *
        `;

        if (order.length > 0) {
            res.send({ message: "Commande supprimée", order: order[0] });
        } else {
            res.status(404).send({ message: "Commande introuvable" });
        }
    } catch (error) {
        res.status(500).send({ message: "Erreur serveur" });
    }
});



// ==========================================
// EXERCICE 5 : REVIEWS
// ==========================================

const CreateReviewSchema = z.object({
    userId: z.number().or(z.string().transform(Number)),
    productId: z.number().or(z.string().transform(Number)),
    score: z.number().min(1).max(5),
    content: z.string().min(2)
});



app.post("/reviews", async (req, res) => {
    const result = CreateReviewSchema.safeParse(req.body);
    if (!result.success) return res.status(400).send(result.error);

    const { userId, productId, score, content } = result.data;

    try {
        const review = await sql`
            INSERT INTO reviews (user_id, product_id, score, content)
            VALUES (${userId}, ${productId}, ${score}, ${content})
            RETURNING *
        `;
        

        await sql`
            UPDATE products
            SET 
                review_ids = array_append(review_ids, ${review[0].id}),
                total_score = (
                    SELECT COALESCE(AVG(score), 0) 
                    FROM reviews 
                    WHERE product_id = ${productId}
                )
            WHERE id = ${productId}
        `;

        res.status(201).send(review[0]);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Erreur lors de la création de l'avis" });
    }
});




app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});