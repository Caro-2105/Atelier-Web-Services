const soap = require("soap");

soap.createClient("http://localhost:8000/products?wsdl", {}, function (err, client) {
    if (err) return console.error(err);

    // 1. Création
    console.log("1. Création...");
    client.CreateProduct({ name: "Produit Test", about: "A test", price: 100 }, function (err, result) {
        if (err) return console.error(err);
        
        const createdId = result.id;
        console.log("✅ Créé avec ID:", createdId);

        console.log("--- Récupération de tous les produits ---");
    
    // On appelle GetProducts sans arguments ({})
        client.GetProducts({}, function (err, result) {
            if (err) return console.error("Erreur:", err.body || err);
            
            // Node-soap transforme souvent la liste en objet.
            // Selon la version, result peut être directement le tableau ou contenir une clé.
            console.log("Résultat brut:", JSON.stringify(result, null, 2));

            // 2. Patch (Modification)
            console.log("\n2. Modification du prix (Patch)...");
            client.PatchProduct({ id: createdId, price: 50 }, function (err, result) {
                if (err) return console.error("Erreur Patch:", err.body || err);
                console.log("✅ Modifié:", result.product);

                // 3. Suppression
                console.log("\n3. Suppression...");
                client.DeleteProduct({ id: createdId }, function (err, result) {
                    if (err) return console.error("Erreur Delete:", err.body || err);
                    console.log("✅ Supprimé (Success):", result.success);
                });
            });
        });
    });
});