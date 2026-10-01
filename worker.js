const OFFLINE_THRESHOLD = 180000;      // 3 menit
const DELETE_THRESHOLD = 86400000;     // 24 jam

const BOT_PREFIX = "BOT:";
const COMMAND_PREFIX = "COMMAND:";

const MASTER_ADOPT_ME_ITEMS = [
  "Admin Abuse Egg",
  "Crystal Egg",
  "Cracked Egg",
  "Pet Egg",
  "Royal Egg",
  "Aussie Egg",
  "Fossil Egg",
  "Mythic Egg",
  "Southeast Asia Egg",
  "Urban Egg",
  "Desert Egg",
  "Japan Egg",
  "Danger Egg",

  "Alicorn",
  "Ancient Dragon",
  "Shadow Dragon",
  "Bat Dragon",
  "Frost Dragon",
  "Giraffe",
  "Owl",
  "Parrot",
  "Evil Unicorn",
  "Crow",
  "Arctic Reindeer",
  "Turtle",
  "Kangaroo",
  "Albino Monkey",
  "Queen Bee",
  "Diamond Unicorn",
  "Golden Dragon",
  "Cerberus",
  "Kitsune",
  "Griffin",
  "Dragon",
  "Unicorn",
  "Dog",
  "Cat",
  "Buffalo",
  "Otter",

  "Ride Potion",
  "Fly Potion",
  "Small Age Potion",
  "Age Up Potion",
  "Water Walk Potion",

  "Golden Apple",
  "Cotton Candy",
  "Hot Dog",
  "Pizza",
  "Coffee",

  "Tealwood Monster Bait",
  "Rat Box",
  "Boba Car",
  "Bathtub",
  "Cloud Stroller",
  "Telescope Pogo"
];

function cleanItemName(rawName) {
  if (!rawName) return "Unknown";

  let name = String(rawName).toLowerCase();

  name = name.replace(
    /^(basic_egg_|pet_shop_|royal_egg_|cracked_egg_|event_|crate_)/g,
    ""
  );

  name = name.replace(
    /(_2025|_2024|_2023|_box|_pet)/g,
    ""
  );

  return name
    .split("_")
    .map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store"
    }
  });
}

function getUsernameFromRequest(body) {
  return String(body?.username || "").trim();
}

async function getBot(env, username) {
  return await env.BOT_KV.get(
    `${BOT_PREFIX}${username}`,
    "json"
  );
}

async function saveBot(env, username, bot) {
  await env.BOT_KV.put(
    `${BOT_PREFIX}${username}`,
    JSON.stringify(bot)
  );
}

async function getCommands(env, username) {
  return (
    await env.BOT_KV.get(
      `${COMMAND_PREFIX}${username}`,
      "json"
    )
  ) || [];
}

async function saveCommands(env, username, commands) {
  const key = `${COMMAND_PREFIX}${username}`;

  if (!commands || commands.length === 0) {
    await env.BOT_KV.delete(key);
    return;
  }

  await env.BOT_KV.put(
    key,
    JSON.stringify(commands)
  );
}

function normalizeInventory(inventory) {
  const flatInventory = [];

  if (!inventory) {
    return flatInventory;
  }

  // Format:
  // [
  //   { id, name, type }
  // ]
  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      if (!item || typeof item !== "object") continue;

      flatInventory.push({
        id: item.id ?? "",
        name: item.name || item.kind || "Unknown",
        type: item.type || "Item"
      });
    }

    return flatInventory;
  }

  // Format:
  // {
  //   pets: {
  //     uniqueId: {
  //       kind: "Dog"
  //     }
  //   }
  // }
  if (typeof inventory === "object") {
    for (const category of Object.keys(inventory)) {
      const categoryData = inventory[category];

      if (
        !categoryData ||
        typeof categoryData !== "object"
      ) {
        continue;
      }

      for (const id of Object.keys(categoryData)) {
        const itemObj = categoryData[id];

        if (
          !itemObj ||
          typeof itemObj !== "object"
        ) {
          continue;
        }

        flatInventory.push({
          id,
          name:
            itemObj.kind ||
            itemObj.name ||
            category,
          type: String(category).toUpperCase()
        });
      }
    }
  }

  return flatInventory;
}

function summarizeInventory(flatInventory) {
  const summary = {};
  const itemCounts = {};

  for (const item of flatInventory) {
    if (!item || !item.name) continue;

    const cleanedName = cleanItemName(item.name);

    if (!summary[cleanedName]) {
      summary[cleanedName] = {
        name: cleanedName,
        count: 0,
        type: item.type || "Item"
      };
    }

    summary[cleanedName].count++;

    itemCounts[cleanedName] =
      (itemCounts[cleanedName] || 0) + 1;
  }

  return {
    groupedInventory: Object.values(summary),
    itemCounts
  };
}

function calculateCrystalEggCount(itemCounts) {
  let total = 0;

  for (const [name, count] of Object.entries(itemCounts)) {
    const lower = name.toLowerCase();

    if (
      lower.includes("crystal") &&
      lower.includes("egg")
    ) {
      total += Number(count) || 0;
    }
  }

  return total;
}

async function handleTelemetry(request, env) {
  if (!env.BOT_KV) {
    return jsonResponse(
      {
        success: false,
        error: "BOT_KV binding belum tersedia"
      },
      500
    );
  }

  const authorization =
    request.headers.get("Authorization");

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
    body = await request.json();
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username = getUsernameFromRequest(body);

  if (!username) {
    return jsonResponse(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const now = Date.now();

  const previousBot =
    (await getBot(env, username)) || {};

  /*
   * =========================================================
   * INVENTORY
   * =========================================================
   */

  const flatInventory =
    normalizeInventory(body.inventory);

  const {
    groupedInventory,
    itemCounts
  } = summarizeInventory(flatInventory);

  const crystalEggCount =
    calculateCrystalEggCount(itemCounts);

  /*
   * =========================================================
   * SIMPAN DATA BOT
   * =========================================================
   *
   * Kita sengaja menyimpan groupedInventory + itemCounts
   * langsung di BOT:<username>.
   *
   * Tujuannya:
   * Dashboard / Tas tidak perlu request inventory kedua.
   */

  const bot = {
    ...previousBot,

    username,

    rf_location:
      body.rf_location || "Unknown",

    status:
      body.status || "ONLINE",

    bucks:
      Number(body.bucks) || 0,

    eggCount:
      Number(body.eggCount) || 0,

    petCount:
      Number(body.petCount) || 0,

    crystalEggCount,

    groupedInventory,

    itemCounts,

    inventoryCount:
      flatInventory.length,

    inventoryUpdatedAt: now,

    autotrade_status:
      Boolean(body.autotrade_status),

    lastHeartbeat: now
  };

  await saveBot(
    env,
    username,
    bot
  );

  /*
   * =========================================================
   * COMMAND
   * =========================================================
   *
   * Persis seperti server lama:
   *
   * telemetry masuk
   * -> server simpan inventory
   * -> ambil 1 command
   * -> command dikirim melalui response telemetry
   */

  const commands =
    await getCommands(env, username);

  let command = null;

  if (commands.length > 0) {
    command = commands.shift();

    await saveCommands(
      env,
      username,
      commands
    );
  }

  return jsonResponse({
    success: true,
    command
  });
}

async function handleInventoryCommand(
  request,
  env
) {
  if (!env.BOT_KV) {
    return jsonResponse(
      {
        success: false,
        error: "BOT_KV binding belum tersedia"
      },
      500
    );
  }

  const authorization =
    request.headers.get("Authorization");

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
    body = await request.json();
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
      body?.bot_username || ""
    ).trim();

  if (!username) {
    return jsonResponse(
      {
        success: false,
        error: "Missing bot_username"
      },
      400
    );
  }

  const bot =
    await getBot(env, username);

  if (!bot) {
    return jsonResponse(
      {
        success: false,
        error: "Bot tidak ditemukan"
      },
      404
    );
  }

  const commands =
    await getCommands(env, username);

  /*
   * Jangan menumpuk REQUEST_INVENTORY berkali-kali
   * kalau user menekan refresh beberapa kali.
   */
  const alreadyQueued =
    commands.some(
      command =>
        command?.type === "REQUEST_INVENTORY"
    );

  if (!alreadyQueued) {
    commands.push({
      type: "REQUEST_INVENTORY",
      createdAt: Date.now()
    });

    await saveCommands(
      env,
      username,
      commands
    );
  }

  return jsonResponse({
    success: true,
    queued: !alreadyQueued,
    message: alreadyQueued
      ? "Refresh inventory sudah berada dalam antrean"
      : "REQUEST_INVENTORY berhasil diantrikan"
  });
}

async function handleCommandPoll(
  request,
  env
) {
  /*
   * Endpoint ini hanya untuk kompatibilitas.
   *
   * Mekanisme utama TIDAK menggunakan polling.
   * Command normalnya dikirim melalui response /api/telemetry.
   */

  if (!env.BOT_KV) {
    return jsonResponse(
      {
        success: false,
        error: "BOT_KV binding belum tersedia"
      },
      500
    );
  }

  const authorization =
    request.headers.get("Authorization");

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
      url.searchParams.get("username") || ""
    ).trim();

  if (!username) {
    return jsonResponse(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const commands =
    await getCommands(env, username);

  let command = null;

  if (commands.length > 0) {
    command = commands.shift();

    await saveCommands(
      env,
      username,
      commands
    );
  }

  return jsonResponse({
    success: true,
    command
  });
}

async function handleDashboardData(
  env
) {
  if (!env.BOT_KV) {
    return jsonResponse(
      {
        success: false,
        error: "BOT_KV binding belum tersedia"
      },
      500
    );
  }

  const list =
    await env.BOT_KV.list({
      prefix: BOT_PREFIX
    });

  const botsList = [];

  const now = Date.now();

  let onlineCount = 0;
  let offlineCount = 0;

  /*
   * Total item generic.
   *
   * Contoh:
   * {
   *   "Crystal Egg": 25,
   *   "Alicorn": 4,
   *   "Dog": 18
   * }
   */
  const itemTotals = {};

  for (const key of list.keys) {
    const username =
      key.name.substring(
        BOT_PREFIX.length
      );

    const bot =
      await getBot(env, username);

    if (!bot) continue;

    const timeDiff =
      now - Number(
        bot.lastHeartbeat || 0
      );

    /*
     * Sama seperti server lama:
     * lebih dari 24 jam -> hapus
     */
    if (timeDiff > DELETE_THRESHOLD) {
      await env.BOT_KV.delete(
        `${BOT_PREFIX}${username}`
      );

      await env.BOT_KV.delete(
        `${COMMAND_PREFIX}${username}`
      );

      continue;
    }

    /*
     * Sama seperti server lama:
     * lebih dari 3 menit -> OFFLINE
     */
    const currentStatus =
      timeDiff > OFFLINE_THRESHOLD
        ? "OFFLINE"
        : (
            bot.status || "OFFLINE"
          );

    if (currentStatus === "ONLINE") {
      onlineCount++;
    } else {
      offlineCount++;
    }

    /*
     * Hitung total semua item.
     */
    if (
      bot.itemCounts &&
      typeof bot.itemCounts === "object"
    ) {
      for (
        const [
          itemName,
          count
        ] of Object.entries(
          bot.itemCounts
        )
      ) {
        itemTotals[itemName] =
          (
            itemTotals[itemName] || 0
          ) + (
            Number(count) || 0
          );
      }
    }

    /*
     * Jangan kirim inventory mentah.
     * Dashboard cukup menerima groupedInventory.
     */
    botsList.push({
      username,

      rf_location:
        bot.rf_location || "Unknown",

      status: currentStatus,

      bucks:
        Number(bot.bucks) || 0,

      eggCount:
        Number(bot.eggCount) || 0,

      petCount:
        Number(bot.petCount) || 0,

      crystalEggCount:
        Number(bot.crystalEggCount) || 0,

      groupedInventory:
        bot.groupedInventory || [],

      itemCounts:
        bot.itemCounts || {},

      inventoryCount:
        Number(bot.inventoryCount) || 0,

      inventoryUpdatedAt:
        bot.inventoryUpdatedAt || null,

      autotrade_status:
        Boolean(bot.autotrade_status),

      lastHeartbeat:
        bot.lastHeartbeat || null,

      lastUpdatedFormatted:
        bot.lastHeartbeat
          ? new Date(
              bot.lastHeartbeat
            ).toLocaleTimeString(
              "id-ID",
              {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              }
            )
          : "-"
    });
  }

  /*
   * Urutkan berdasarkan RF Location,
   * kemudian username.
   */
  botsList.sort((a, b) => {
    const rfA =
      String(
        a.rf_location || ""
      ).trim();

    const rfB =
      String(
        b.rf_location || ""
      ).trim();

    const compareRF =
      rfA.localeCompare(rfB);

    if (compareRF !== 0) {
      return compareRF;
    }

    return a.username.localeCompare(
      b.username
    );
  });

  const totalBucks =
    botsList.reduce(
      (total, bot) =>
        total +
        (
          Number(bot.bucks) || 0
        ),
      0
    );

  const totalCrystalEggs =
    botsList.reduce(
      (total, bot) =>
        total +
        (
          Number(
            bot.crystalEggCount
          ) || 0
        ),
      0
    );

  return jsonResponse({
    success: true,

    bots: botsList,

    totalBucks,

    totalCrystalEggs,

    totalBots:
      botsList.length,

    onlineBots:
      onlineCount,

    offlineBots:
      offlineCount,

    /*
     * Generic.
     * Dashboard nantinya bisa mengambil item apapun.
     */
    itemTotals
  });
}

async function handleInventoryDetail(
  env,
  username
) {
  const bot =
    await getBot(env, username);

  if (!bot) {
    return jsonResponse(
      {
        success: false,
        error: "Bot tidak ditemukan"
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
      bot.inventoryUpdatedAt || null
  });
}

async function handleHealth(env) {
  return jsonResponse({
    success: true,

    worker:
      "online",

    kv:
      Boolean(env.BOT_KV),

    botTokenConfigured:
      Boolean(env.BOT_TOKEN),

    mode:
      "monitor-only",

    communication:
      "telemetry-response-command",

    time:
      Date.now()
  });
}

export default {
  async fetch(request, env) {
    const url =
      new URL(request.url);

    const path =
      url.pathname;

    /*
     * =====================================================
     * CORS
     * =====================================================
     */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods":
            "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization"
        }
      });
    }

    try {
      /*
       * ===================================================
       * HEALTH
       * ===================================================
       */

      if (
        path === "/api/health" &&
        request.method === "GET"
      ) {
        return await handleHealth(env);
      }

      /*
       * ===================================================
       * TELEMETRY
       * ===================================================
       */

      if (
        path === "/api/telemetry" &&
        request.method === "POST"
      ) {
        return await handleTelemetry(
          request,
          env
        );
      }

      /*
       * ===================================================
       * MANUAL REFRESH INVENTORY
       * ===================================================
       */

      if (
        path === "/api/command/inventory" &&
        request.method === "POST"
      ) {
        return await handleInventoryCommand(
          request,
          env
        );
      }

      /*
       * ===================================================
       * COMPATIBILITY COMMAND POLL
       * ===================================================
       */

      if (
        path === "/api/command/poll" &&
        request.method === "GET"
      ) {
        return await handleCommandPoll(
          request,
          env
        );
      }

      /*
       * ===================================================
       * DASHBOARD DATA
       * ===================================================
       */

      if (
        path === "/api/dashboard/data" &&
        request.method === "GET"
      ) {
        return await handleDashboardData(
          env
        );
      }

      /*
       * ===================================================
       * INVENTORY DETAIL
       * ===================================================
       */

      if (
        path.startsWith(
          "/api/inventory/"
        ) &&
        request.method === "GET"
      ) {
        const username =
          decodeURIComponent(
            path.substring(
              "/api/inventory/".length
            )
          );

        return await handleInventoryDetail(
          env,
          username
        );
      }

      /*
       * ===================================================
       * MASTER ITEMS
       * ===================================================
       */

      if (
        path === "/api/master-items" &&
        request.method === "GET"
      ) {
        return jsonResponse({
          success: true,
          items:
            MASTER_ADOPT_ME_ITEMS
        });
      }

      /*
       * ===================================================
       * ROOT / ASSETS
       * ===================================================
       */

      if (
        request.method === "GET" &&
        env.ASSETS
      ) {
        return await env.ASSETS.fetch(
          request
        );
      }

      return jsonResponse(
        {
          success: false,
          error: "Not Found"
        },
        404
      );

    } catch (error) {
      console.error(
        "Worker error:",
        error
      );

      return jsonResponse(
        {
          success: false,
          error:
            error?.message ||
            "Internal Server Error"
        },
        500
      );
    }
  }
};
