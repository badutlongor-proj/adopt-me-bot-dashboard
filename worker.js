// ============================================================
// ADOPT ME BOT DASHBOARD
// CLOUDFLARE WORKER
// ============================================================

const OFFLINE_THRESHOLD = 180000; // 3 menit
const DELETE_THRESHOLD = 86400000; // 24 jam

const BOT_PREFIX = "BOT:";
const COMMAND_PREFIX = "COMMAND:";


// ============================================================
// RESPONSE
// ============================================================

function jsonResponse(data, status = 200) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods":
                    "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization"
            }
        }
    );

}


// ============================================================
// CORS
// ============================================================

function corsResponse() {

    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods":
                "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers":
                "Content-Type, Authorization"
        }
    });

}


// ============================================================
// BOT KEY
// ============================================================

function botKey(username) {

    return BOT_PREFIX + username;

}


// ============================================================
// COMMAND KEY
// ============================================================

function commandKey(username) {

    return COMMAND_PREFIX + username;

}


// ============================================================
// GET BOT
// ============================================================

async function getBot(env, username) {

    return await env.BOT_KV.get(
        botKey(username),
        "json"
    );

}


// ============================================================
// SAVE BOT
// ============================================================

async function saveBot(env, username, data) {

    await env.BOT_KV.put(
        botKey(username),
        JSON.stringify(data)
    );

}


// ============================================================
// GET COMMANDS
// ============================================================

async function getCommands(env, username) {

    return (
        await env.BOT_KV.get(
            commandKey(username),
            "json"
        )
    ) || [];

}


// ============================================================
// SAVE COMMANDS
// ============================================================

async function saveCommands(
    env,
    username,
    commands
) {

    await env.BOT_KV.put(
        commandKey(username),
        JSON.stringify(commands)
    );

}


// ============================================================
// NORMALIZE INVENTORY
// ============================================================

function normalizeInventory(inventory) {

    if (!Array.isArray(inventory)) {
        return [];
    }

    return inventory.map((item) => {

        return {
            id:
                item?.id != null
                    ? String(item.id)
                    : "",

            name:
                item?.name
                    ? String(item.name)
                    : "Unknown",

            type:
                item?.type
                    ? String(item.type)
                    : "Pet"
        };

    });

}


// ============================================================
// SUMMARIZE INVENTORY
// ============================================================

function summarizeInventory(inventory) {

    const grouped = {};
    const itemCounts = {};

    for (const item of inventory) {

        const name =
            item.name || "Unknown";

        const type =
            item.type || "Pet";

        const key =
            type + ":" + name;


        if (!itemCounts[key]) {

            itemCounts[key] = {
                name,
                type,
                count: 0
            };

        }

        itemCounts[key].count++;


        if (!grouped[type]) {

            grouped[type] = {
                type,
                items: {}
            };

        }

        if (!grouped[type].items[name]) {

            grouped[type].items[name] = 0;

        }

        grouped[type].items[name]++;

    }


    const groupedInventory =
        Object.values(grouped).map(
            group => {

                return {
                    type: group.type,

                    items:
                        Object.entries(
                            group.items
                        ).map(
                            ([name, count]) => ({
                                name,
                                count
                            })
                        )
                };

            }
        );


    return {
        groupedInventory,
        itemCounts
    };

}


// ============================================================
// CRYSTAL EGG COUNT
// ============================================================

function calculateCrystalEggCount(
    inventory
) {

    let count = 0;

    for (const item of inventory) {

        const name =
            String(
                item?.name || ""
            ).toLowerCase();

        if (
            name.includes("crystal egg")
        ) {

            count++;

        }

    }

    return count;

}


// ============================================================
// TELEMETRY
// ============================================================

async function handleTelemetry(
    request,
    env
) {

    if (!env.BOT_KV) {

        return jsonResponse(
            {
                success: false,
                error:
                    "BOT_KV binding belum tersedia"
            },
            500
        );

    }


    const authorization =
        request.headers.get(
            "Authorization"
        );


    if (
        !env.BOT_TOKEN ||
        authorization !== env.BOT_TOKEN
    ) {

        return jsonResponse(
            {
                success: false,
                error: "Unauthorized"
            },
            401
        );

    }


    let body;

    try {

        body =
            await request.json();

    } catch {

        return jsonResponse(
            {
                success: false,
                error: "Invalid JSON"
            },
            400
        );

    }


    const username =
        String(
            body?.username || ""
        ).trim();


    if (!username) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing username"
            },
            400
        );

    }


    const inventory =
        normalizeInventory(
            body?.inventory
        );


    const summary =
        summarizeInventory(
            inventory
        );


    const now =
        Date.now();


    const bot = {

        username,

        rf_location:
            String(
                body?.rf_location || ""
            ),

        status:
            String(
                body?.status || "ONLINE"
            ),

        bucks:
            Number(
                body?.bucks || 0
            ),

        eggCount:
            Number(
                body?.eggCount || 0
            ),

        petCount:
            Number(
                body?.petCount || 0
            ),

        crystalEggCount:
            calculateCrystalEggCount(
                inventory
            ),

        groupedInventory:
            summary.groupedInventory,

        itemCounts:
            summary.itemCounts,

        inventoryCount:
            inventory.length,

        inventoryUpdatedAt:
            now,

        autotrade_status:
            body?.autotrade_status ||
            "OFF",

        lastHeartbeat:
            now

    };


    await saveBot(
        env,
        username,
        bot
    );


    // ========================================================
    // AMBIL SATU COMMAND
    // ========================================================

    const commands =
        await getCommands(
            env,
            username
        );


    let command =
        null;


    if (commands.length > 0) {

        command =
            commands.shift();

        await saveCommands(
            env,
            username,
            commands
        );

    }


    return jsonResponse({

        success: true,

        message:
            "Telemetry berhasil disimpan",

        command

    });

}


// ============================================================
// POLL COMMAND
// ============================================================

async function handleCommandPoll(
    request,
    env
) {

    if (!env.BOT_KV) {

        return jsonResponse(
            {
                success: false,
                error:
                    "BOT_KV binding belum tersedia"
            },
            500
        );

    }


    const authorization =
        request.headers.get(
            "Authorization"
        );


    if (
        !env.BOT_TOKEN ||
        authorization !== env.BOT_TOKEN
    ) {

        return jsonResponse(
            {
                success: false,
                error: "Unauthorized"
            },
            401
        );

    }


    const url =
        new URL(request.url);


    const username =
        String(
            url.searchParams.get(
                "username"
            ) || ""
        ).trim();


    if (!username) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing username"
            },
            400
        );

    }


    const bot =
        await getBot(
            env,
            username
        );


    if (!bot) {

        return jsonResponse(
            {
                success: true,
                command: null
            }
        );

    }


    const commands =
        await getCommands(
            env,
            username
        );


    if (
        !Array.isArray(commands) ||
        commands.length === 0
    ) {

        return jsonResponse({

            success: true,

            username,

            command: null

        });

    }


    const command =
        commands.shift();


    await saveCommands(
        env,
        username,
        commands
    );


    return jsonResponse({

        success: true,

        username,

        command

    });

}


// ============================================================
// REFRESH INVENTORY SEMUA BOT
// ============================================================

async function handleInventoryCommandAll(
    request,
    env
) {

    if (!env.BOT_KV) {

        return jsonResponse(
            {
                success: false,
                error:
                    "BOT_KV binding belum tersedia"
            },
            500
        );

    }


    const authorization =
        request.headers.get(
            "Authorization"
        );


    if (
        !env.BOT_TOKEN ||
        authorization !== env.BOT_TOKEN
    ) {

        return jsonResponse(
            {
                success: false,
                error: "Unauthorized"
            },
            401
        );

    }


    const list =
        await env.BOT_KV.list({
            prefix: BOT_PREFIX
        });


    let queued =
        0;

    let alreadyQueued =
        0;

    let skipped =
        0;


    for (const key of list.keys) {

        const username =
            key.name.substring(
                BOT_PREFIX.length
            );


        if (!username) {

            skipped++;

            continue;

        }


        const commands =
            await getCommands(
                env,
                username
            );


        const exists =
            commands.some(
                command =>
                    command?.type ===
                    "REQUEST_INVENTORY"
            );


        if (exists) {

            alreadyQueued++;

            continue;

        }


        commands.push({

            type:
                "REQUEST_INVENTORY",

            createdAt:
                Date.now()

        });


        await saveCommands(
            env,
            username,
            commands
        );


        queued++;

    }


    return jsonResponse({

        success: true,

        queued,

        alreadyQueued,

        skipped,

        totalBots:
            list.keys.length,

        message:
            "REQUEST_INVENTORY berhasil diantrikan ke semua bot"

    });

}


// ============================================================
// DASHBOARD DATA
// ============================================================

async function handleDashboardData(
    env
) {

    if (!env.BOT_KV) {

        return jsonResponse(
            {
                success: false,
                error:
                    "BOT_KV binding belum tersedia"
            },
            500
        );

    }


    const list =
        await env.BOT_KV.list({
            prefix: BOT_PREFIX
        });


    const bots =
        [];

    const now =
        Date.now();


    for (const key of list.keys) {

        const username =
            key.name.substring(
                BOT_PREFIX.length
            );


        const bot =
            await getBot(
                env,
                username
            );


        if (!bot) {

            continue;

        }


        const lastHeartbeat =
            Number(
                bot.lastHeartbeat || 0
            );


        // ====================================================
        // HAPUS BOT YANG SUDAH > 24 JAM
        // ====================================================

        if (
            lastHeartbeat > 0 &&
            now - lastHeartbeat >
                DELETE_THRESHOLD
        ) {

            await env.BOT_KV.delete(
                key.name
            );

            await env.BOT_KV.delete(
                commandKey(username)
            );

            continue;

        }


        const online =
            lastHeartbeat > 0 &&
            now - lastHeartbeat <=
                OFFLINE_THRESHOLD;


        bots.push({

            username:
                bot.username,

            rf_location:
                bot.rf_location || "",

            status:
                online
                    ? "ONLINE"
                    : "OFFLINE",

            bucks:
                Number(
                    bot.bucks || 0
                ),

            eggCount:
                Number(
                    bot.eggCount || 0
                ),

            petCount:
                Number(
                    bot.petCount || 0
                ),

            crystalEggCount:
                Number(
                    bot.crystalEggCount || 0
                ),

            groupedInventory:
                bot.groupedInventory || [],

            itemCounts:
                bot.itemCounts || {},

            inventoryCount:
                Number(
                    bot.inventoryCount || 0
                ),

            inventoryUpdatedAt:
                bot.inventoryUpdatedAt ||
                null,

            autotrade_status:
                bot.autotrade_status ||
                "OFF",

            lastHeartbeat:
                bot.lastHeartbeat ||
                null

        });

    }


    // ========================================================
    // TOTAL
    // ========================================================

    let onlineCount =
        0;

    let offlineCount =
        0;

    let totalBucks =
        0;

    let totalCrystalEgg =
        0;

    let totalInventory =
        0;


    for (const bot of bots) {

        if (
            bot.status === "ONLINE"
        ) {

            onlineCount++;

        } else {

            offlineCount++;

        }


        totalBucks +=
            bot.bucks;

        totalCrystalEgg +=
            bot.crystalEggCount;

        totalInventory +=
            bot.inventoryCount;

    }


    return jsonResponse({

        success: true,

        time:
            now,

        stats: {

            total:
                bots.length,

            online:
                onlineCount,

            offline:
                offlineCount,

            totalBucks,

            totalCrystalEgg,

            totalInventory

        },

        bots

    });

}


// ============================================================
// INVENTORY DETAIL
// ============================================================

async function handleInventoryDetail(
    env,
    username
) {

    if (!username) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Missing username"
            },
            400
        );

    }


    const bot =
        await getBot(
            env,
            username
        );


    if (!bot) {

        return jsonResponse(
            {
                success: false,
                error:
                    "Bot tidak ditemukan"
            },
            404
        );

    }


    return jsonResponse({

        success: true,

        username,

        groupedInventory:
            bot.groupedInventory || [],

        itemCounts:
            bot.itemCounts || {},

        inventoryCount:
            bot.inventoryCount || 0,

        inventoryUpdatedAt:
            bot.inventoryUpdatedAt ||
            null

    });

}


// ============================================================
// HEALTH
// ============================================================

async function handleHealth(env) {

    return jsonResponse({

        success: true,

        worker:
            "online",

        kv:
            !!env.BOT_KV,

        botTokenConfigured:
            !!env.BOT_TOKEN,

        mode:
            "monitor-only",

        communication:
            "telemetry-command-poll",

        time:
            Date.now()

    });

}


// ============================================================
// MASTER ITEMS
// ============================================================

async function handleMasterItems() {

    return jsonResponse({

        success: true,

        items: []

    });

}


// ============================================================
// MAIN FETCH
// ============================================================

export default {

    async fetch(request, env) {

        try {

            // ==================================================
            // OPTIONS
            // ==================================================

            if (
                request.method ===
                "OPTIONS"
            ) {

                return corsResponse();

            }


            const url =
                new URL(
                    request.url
                );


            // ==================================================
            // HEALTH
            // ==================================================

            if (
                url.pathname ===
                "/api/health" &&
                request.method ===
                "GET"
            ) {

                return handleHealth(
                    env
                );

            }


            // ==================================================
            // TELEMETRY
            // ==================================================

            if (
                url.pathname ===
                "/api/telemetry" &&
                request.method ===
                "POST"
            ) {

                return handleTelemetry(
                    request,
                    env
                );

            }


            // ==================================================
            // POLL COMMAND
            // ==================================================

            if (
                url.pathname ===
                "/api/command/poll" &&
                request.method ===
                "GET"
            ) {

                return handleCommandPoll(
                    request,
                    env
                );

            }


            // ==================================================
            // REFRESH SEMUA INVENTORY
            // ==================================================

            if (
                url.pathname ===
                "/api/command/inventory/all" &&
                request.method ===
                "POST"
            ) {

                return handleInventoryCommandAll(
                    request,
                    env
                );

            }


            // ==================================================
            // INVENTORY SINGLE BOT
            // ==================================================

            if (
                url.pathname ===
                "/api/command/inventory" &&
                request.method ===
                "POST"
            ) {

                // Backward compatibility:
                // endpoint lama tetap bisa digunakan.

                const authorization =
                    request.headers.get(
                        "Authorization"
                    );


                if (
                    !env.BOT_TOKEN ||
                    authorization !==
                        env.BOT_TOKEN
                ) {

                    return jsonResponse(
                        {
                            success: false,
                            error:
                                "Unauthorized"
                        },
                        401
                    );

                }


                let body;

                try {

                    body =
                        await request.json();

                } catch {

                    return jsonResponse(
                        {
                            success: false,
                            error:
                                "Invalid JSON"
                        },
                        400
                    );

                }


                const username =
                    String(
                        body?.bot_username ||
                        ""
                    ).trim();


                if (!username) {

                    return jsonResponse(
                        {
                            success: false,
                            error:
                                "Missing bot_username"
                        },
                        400
                    );

                }


                const bot =
                    await getBot(
                        env,
                        username
                    );


                if (!bot) {

                    return jsonResponse(
                        {
                            success: false,
                            error:
                                "Bot tidak ditemukan"
                        },
                        404
                    );

                }


                const commands =
                    await getCommands(
                        env,
                        username
                    );


                const alreadyQueued =
                    commands.some(
                        command =>
                            command?.type ===
                            "REQUEST_INVENTORY"
                    );


                if (!alreadyQueued) {

                    commands.push({

                        type:
                            "REQUEST_INVENTORY",

                        createdAt:
                            Date.now()

                    });


                    await saveCommands(
                        env,
                        username,
                        commands
                    );

                }


                return jsonResponse({

                    success: true,

                    queued:
                        !alreadyQueued,

                    message:
                        alreadyQueued
                            ? "Refresh inventory sudah berada dalam antrean"
                            : "REQUEST_INVENTORY berhasil diantrikan"

                });

            }


            // ==================================================
            // DASHBOARD DATA
            // ==================================================

            if (
                url.pathname ===
                "/api/dashboard/data" &&
                request.method ===
                "GET"
            ) {

                return handleDashboardData(
                    env
                );

            }


            // ==================================================
            // INVENTORY DETAIL
            // ==================================================

            if (
                url.pathname.startsWith(
                    "/api/inventory/"
                ) &&
                request.method ===
                "GET"
            ) {

                const username =
                    decodeURIComponent(
                        url.pathname.substring(
                            "/api/inventory/"
                                .length
                        )
                    );


                return handleInventoryDetail(
                    env,
                    username
                );

            }


            // ==================================================
            // MASTER ITEMS
            // ==================================================

            if (
                url.pathname ===
                "/api/master-items" &&
                request.method ===
                "GET"
            ) {

                return handleMasterItems();

            }


            // ==================================================
            // ASSETS
            // ==================================================

            if (
                request.method ===
                "GET"
            ) {

                const assetResponse =
                    await env.ASSETS.fetch(
                        request
                    );


                if (
                    assetResponse.status !==
                    404
                ) {

                    return assetResponse;

                }

            }


            // ==================================================
            // NOT FOUND
            // ==================================================

            return jsonResponse(
                {
                    success: false,
                    error: "Not Found"
                },
                404
            );

        } catch (error) {

            return jsonResponse(
                {
                    success: false,
                    error:
                        String(
                            error?.message ||
                            error
                        )
                },
                500
            );

        }

    }

};
