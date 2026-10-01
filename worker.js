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

/*
 * =========================================================
 * ITEM NAME
 * =========================================================
 */

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

/*
 * =========================================================
 * RESPONSE
 * =========================================================
 */

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

/*
 * =========================================================
 * BOT HELPERS
 * =========================================================
 */

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

/*
 * =========================================================
 * COMMAND HELPERS
 * =========================================================
 */

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

/*
 * =========================================================
 * INVENTORY NORMALIZATION
 * =========================================================
 */

function normalizeInventory(inventory) {
  const flatInventory = [];

  if (!inventory) {
    return flatInventory;
  }

  /*
   * Format:
   *
   * [
   *   {
   *     id,
   *     name,
   *     type
   *   }
   * ]
   */

  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      if (!item || typeof item !== "object") {
        continue;
      }

      flatInventory.push({
        id: item.id ?? "",
        name:
          item.name ||
          item.kind ||
          "Unknown",
        type:
          item.type ||
          "Item"
      });
    }

    return flatInventory;
  }

  /*
   * Format:
   *
   * {
   *   pets: {
   *     uniqueId: {
   *       kind: "Dog"
   *     }
   *   }
   * }
   */

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

          type:
            String(category).toUpperCase()
        });
      }
    }
  }

  return flatInventory;
}

/*
 * =========================================================
 * INVENTORY SUMMARY
 * =========================================================
 */

function summarizeInventory(flatInventory) {
  const summary = {};
  const itemCounts = {};

  for (const item of flatInventory) {
    if (!item || !item.name) {
      continue;
    }

    const cleanedName =
      cleanItemName(item.name);

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
    groupedInventory:
      Object.values(summary),

    itemCounts
  };
}

/*
 * =========================================================
 * CRYSTAL EGG
 * =========================================================
 */

function calculateCrystalEggCount(itemCounts) {
  let total = 0;

  for (
    const [name, count]
    of Object.entries(itemCounts)
  ) {
    const lower =
      name.toLowerCase();

    if (
      lower.includes("crystal") &&
      lower.includes("egg")
    ) {
      total += Number(count) || 0;
    }
  }

  return total;
}

/*
 * =========================================================
 * TELEMETRY
 * =========================================================
 *
 * Bot:
 *
 * POST /api/telemetry
 *
 * Worker:
 * 1. Simpan status
 * 2. Simpan inventory
 * 3. Ambil 1 command
 * 4. Kirim command melalui response
 *
 * =========================================================
 */

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

  const username =
    getUsernameFromRequest(body);

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
   * =======================================================
   * INVENTORY
   * =======================================================
   */

  const flatInventory =
    normalizeInventory(body.inventory);

  const {
    groupedInventory,
    itemCounts
  } =
    summarizeInventory(flatInventory);

  const crystalEggCount =
    calculateCrystalEggCount(itemCounts);

  /*
   * =======================================================
   * SAVE BOT
   * =======================================================
   */

  const bot = {
    ...previousBot,

    username,

    rf_location:
      body.rf_location ||
      previousBot.rf_location ||
      "Unknown",

    status:
      body.status ||
      "ONLINE",

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

    inventoryUpdatedAt:
      now,

    autotrade_status:
      Boolean(body.autotrade_status),

    lastHeartbeat:
      now
  };

  await saveBot(
    env,
    username,
    bot
  );

  /*
   * =======================================================
   * COMMAND
   * =======================================================
   *
   * Ambil hanya 1 command.
   *
   * Ini menjaga sistem command tetap sederhana.
   */

  const commands =
    await getCommands(
      env,
      username
    );

  let command = null;

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
    command
  });
}

/*
 * =========================================================
 * MANUAL REFRESH 1 BOT
 * =========================================================
 */

async function handleInventoryCommand(
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

    username,

    message:
      alreadyQueued
        ? "Refresh inventory sudah berada dalam antrean"
        : "REQUEST_INVENTORY berhasil diantrikan"
  });
}

/*
 * =========================================================
 * MANUAL REFRESH SEMUA BOT
 * =========================================================
 *
 * ENDPOINT BARU
 *
 * POST /api/command/inventory/all
 *
 * Dashboard cukup melakukan SATU request.
 *
 * Worker:
 * - mencari semua BOT:
 * - membuat REQUEST_INVENTORY
 * - tidak membuat duplikat
 *
 * =========================================================
 */

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

  /*
   * Ambil semua BOT.
   *
   * KV list default memiliki pagination.
   * Kita lanjutkan sampai semua key terbaca.
   */

  const botKeys = [];

  let cursor = undefined;

  do {
    const result =
      await env.BOT_KV.list({
        prefix:
          BOT_PREFIX,

        ...(cursor
          ? { cursor }
          : {})
      });

    for (const key of result.keys) {
      botKeys.push(key.name);
    }

    cursor =
      result.list_complete
        ? undefined
        : result.cursor;

  } while (cursor);

  let botCount = 0;
  let queuedCount = 0;
  let alreadyQueuedCount = 0;
  let skippedCount = 0;

  /*
   * =======================================================
   * QUEUE COMMAND KE SEMUA BOT
   * =======================================================
   */

  for (const key of botKeys) {
    const username =
      key.substring(
        BOT_PREFIX.length
      );

    if (!username) {
      skippedCount++;
      continue;
    }

    const bot =
      await getBot(
        env,
        username
      );

    if (!bot) {
      skippedCount++;
      continue;
    }

    botCount++;

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

    if (alreadyQueued) {
      alreadyQueuedCount++;
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

    queuedCount++;
  }

  return jsonResponse({
    success: true,

    message:
      "REQUEST_INVENTORY berhasil diproses untuk semua bot",

    totalBots:
      botCount,

    queued:
      queuedCount,

    alreadyQueued:
      alreadyQueuedCount,

    skipped:
      skippedCount,

    createdAt:
      Date.now()
  });
}

/*
 * =========================================================
 * COMMAND POLL
 * =========================================================
 *
 * Kompatibilitas dengan sistem lama.
 * Mekanisme utama tetap telemetry-response-command.
 *
 * =========================================================
 */

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

  const commands =
    await getCommands(
      env,
      username
    );

  let command = null;

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
    command
  });
}

/*
 * =========================================================
 * DASHBOARD DATA
 * =========================================================
 */

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

  const botsList =
    [];

  const now =
    Date.now();

  let onlineCount =
    0;

  let offlineCount =
    0;

  const itemTotals =
    {};

  /*
   * =======================================================
   * KV PAGINATION
   * =======================================================
   */

  let cursor =
    undefined;

  do {
    const list =
      await env.BOT_KV.list({
        prefix:
          BOT_PREFIX,

        ...(cursor
          ? { cursor }
          : {})
      });

    for (const key of list.keys) {
      const username =
        key.name.substring(
          BOT_PREFIX.length
        );

      if (!username) {
        continue;
      }

      const bot =
        await getBot(
          env,
          username
        );

      if (!bot) {
        continue;
      }

      const timeDiff =
        now -
        Number(
          bot.lastHeartbeat || 0
        );

      /*
       * ===================================================
       * DELETE BOT > 24 JAM
       * ===================================================
       */

      if (
        timeDiff >
        DELETE_THRESHOLD
      ) {
        await env.BOT_KV.delete(
          `${BOT_PREFIX}${username}`
        );

        await env.BOT_KV.delete(
          `${COMMAND_PREFIX}${username}`
        );

        continue;
      }

      /*
       * ===================================================
       * ONLINE / OFFLINE
       * ===================================================
       */

      const currentStatus =
        timeDiff >
        OFFLINE_THRESHOLD
          ? "OFFLINE"
          : (
              bot.status ||
              "OFFLINE"
            );

      if (
        currentStatus ===
        "ONLINE"
      ) {
        onlineCount++;
      } else {
        offlineCount++;
      }

      /*
       * ===================================================
       * TOTAL ITEM
       * ===================================================
       */

      if (
        bot.itemCounts &&
        typeof bot.itemCounts ===
          "object"
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
              itemTotals[itemName] ||
              0
            ) +
            (
              Number(count) ||
              0
            );
        }
      }

      /*
       * ===================================================
       * DATA BOT
       * ===================================================
       */

      botsList.push({
        username,

        rf_location:
          bot.rf_location ||
          "Unknown",

        status:
          currentStatus,

        bucks:
          Number(
            bot.bucks
          ) || 0,

        eggCount:
          Number(
            bot.eggCount
          ) || 0,

        petCount:
          Number(
            bot.petCount
          ) || 0,

        crystalEggCount:
          Number(
            bot.crystalEggCount
          ) || 0,

        groupedInventory:
          bot.groupedInventory ||
          [],

        itemCounts:
          bot.itemCounts ||
          {},

        inventoryCount:
          Number(
            bot.inventoryCount
          ) || 0,

        inventoryUpdatedAt:
          bot.inventoryUpdatedAt ||
          null,

        autotrade_status:
          Boolean(
            bot.autotrade_status
          ),

        lastHeartbeat:
          bot.lastHeartbeat ||
          null,

        lastUpdatedFormatted:
          bot.lastHeartbeat
            ? new Date(
                bot.lastHeartbeat
              ).toLocaleTimeString(
                "id-ID",
                {
                  hour:
                    "2-digit",

                  minute:
                    "2-digit",

                  second:
                    "2-digit"
                }
              )
            : "-"
      });
    }

    cursor =
      list.list_complete
        ? undefined
        : list.cursor;

  } while (cursor);

  /*
   * =======================================================
   * SORT
   * =======================================================
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
      rfA.localeCompare(
        rfB
      );

    if (
      compareRF !== 0
    ) {
      return compareRF;
    }

    return a.username.localeCompare(
      b.username
    );
  });

  /*
   * =======================================================
   * TOTAL BUCKS
   * =======================================================
   */

  const totalBucks =
    botsList.reduce(
      (total, bot) =>
        total +
        (
          Number(
            bot.bucks
          ) || 0
        ),
      0
    );

  /*
   * =======================================================
   * TOTAL CRYSTAL EGG
   * =======================================================
   */

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

    bots:
      botsList,

    totalBucks,

    totalCrystalEggs,

    totalBots:
      botsList.length,

    onlineBots:
      onlineCount,

    offlineBots:
      offlineCount,

    itemTotals
  });
}

/*
 * =========================================================
 * INVENTORY DETAIL
 * =========================================================
 *
 * Endpoint ini tetap tersedia untuk kompatibilitas.
 *
 * Dashboard baru TIDAK perlu memanggilnya ketika membuka
 * inventory karena groupedInventory sudah ada di dashboard data.
 *
 * =========================================================
 */

async function handleInventoryDetail(
  env,
  username
) {
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
      bot.groupedInventory ||
      [],

    itemCounts:
      bot.itemCounts ||
      {},

    inventoryCount:
      bot.inventoryCount ||
      0,

    inventoryUpdatedAt:
      bot.inventoryUpdatedAt ||
      null
  });
}

/*
 * =========================================================
 * HEALTH
 * =========================================================
 */

async function handleHealth(env) {
  return jsonResponse({
    success: true,

    worker:
      "online",

    kv:
      Boolean(
        env.BOT_KV
      ),

    botTokenConfigured:
      Boolean(
        env.BOT_TOKEN
      ),

    mode:
      "monitor-only",

    communication:
      "telemetry-response-command",

    time:
      Date.now()
  });
}

/*
 * =========================================================
 * WORKER
 * =========================================================
 */

export default {
  async fetch(request, env) {
    const url =
      new URL(
        request.url
      );

    const path =
      url.pathname;

    /*
     * =====================================================
     * CORS
     * =====================================================
     */

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,

          headers: {
            "Access-Control-Allow-Origin":
              "*",

            "Access-Control-Allow-Methods":
              "GET,POST,OPTIONS",

            "Access-Control-Allow-Headers":
              "Content-Type, Authorization"
          }
        }
      );
    }

    try {
      /*
       * ===================================================
       * HEALTH
       * ===================================================
       */

      if (
        path ===
          "/api/health" &&
        request.method ===
          "GET"
      ) {
        return await handleHealth(
          env
        );
      }

      /*
       * ===================================================
       * TELEMETRY
       * ===================================================
       */

      if (
        path ===
          "/api/telemetry" &&
        request.method ===
          "POST"
      ) {
        return await handleTelemetry(
          request,
          env
        );
      }

      /*
       * ===================================================
       * MANUAL REFRESH 1 BOT
       * ===================================================
       */

      if (
        path ===
          "/api/command/inventory" &&
        request.method ===
          "POST"
      ) {
        return await handleInventoryCommand(
          request,
          env
        );
      }

      /*
       * ===================================================
       * MANUAL REFRESH SEMUA BOT
       * ===================================================
       *
       * INI ENDPOINT BARU.
       *
       * Dashboard:
       *
       * POST /api/command/inventory/all
       *
       * ===================================================
       */

      if (
        path ===
          "/api/command/inventory/all" &&
        request.method ===
          "POST"
      ) {
        return await handleInventoryCommandAll(
          request,
          env
        );
      }

      /*
       * ===================================================
       * COMMAND POLL
       * ===================================================
       */

      if (
        path ===
          "/api/command/poll" &&
        request.method ===
          "GET"
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
        path ===
          "/api/dashboard/data" &&
        request.method ===
          "GET"
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
        request.method ===
          "GET"
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
        path ===
          "/api/master-items" &&
        request.method ===
          "GET"
      ) {
        return jsonResponse({
          success: true,

          items:
            MASTER_ADOPT_ME_ITEMS
        });
      }

      /*
       * ===================================================
       * ASSETS
       * ===================================================
       */

      if (
        request.method ===
          "GET" &&
        env.ASSETS
      ) {
        return await env.ASSETS.fetch(
          request
        );
      }

      /*
       * ===================================================
       * NOT FOUND
       * ===================================================
       */

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
