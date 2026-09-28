const OFFLINE_THRESHOLD = 2 * 60 * 60 * 1000;
const DELETE_THRESHOLD = 7 * 24 * 60 * 60 * 1000;

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
  "2D Kitty",
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}

/* =========================================================
   ITEM NAME
========================================================= */

function cleanItemName(rawName) {
  if (!rawName) {
    return "Unknown";
  }

  let name = String(rawName).trim().toLowerCase();

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
    .filter(Boolean)
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/* =========================================================
   NORMALIZE INVENTORY
========================================================= */

function normalizeInventory(inventory) {
  const flatInventory = [];

  if (!inventory) {
    return flatInventory;
  }

  /*
   * FORMAT:
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
      if (!item) {
        continue;
      }

      flatInventory.push({
        id: item.id || "",
        name: cleanItemName(
          item.name ||
          item.kind ||
          item.itemName ||
          item.displayName ||
          "Unknown"
        ),
        type:
          item.type ||
          item.category ||
          "ITEM"
      });
    }

    return flatInventory;
  }

  /*
   * FORMAT:
   *
   * {
   *   pets: {
   *     uniqueId: {
   *       kind: "Alicorn"
   *     }
   *   }
   * }
   */
  if (typeof inventory === "object") {
    for (const category in inventory) {
      const categoryData = inventory[category];

      if (
        !categoryData ||
        typeof categoryData !== "object"
      ) {
        continue;
      }

      /*
       * Category berupa array
       */
      if (Array.isArray(categoryData)) {
        for (const item of categoryData) {
          if (!item) {
            continue;
          }

          flatInventory.push({
            id: item.id || "",
            name: cleanItemName(
              item.name ||
              item.kind ||
              item.itemName ||
              item.displayName ||
              "Unknown"
            ),
            type: String(category).toUpperCase()
          });
        }

        continue;
      }

      /*
       * Category berupa object dengan unique ID
       */
      for (const id in categoryData) {
        const item = categoryData[id];

        if (!item) {
          continue;
        }

        if (typeof item === "object") {
          flatInventory.push({
            id: id,
            name: cleanItemName(
              item.kind ||
              item.name ||
              item.itemName ||
              item.displayName ||
              category
            ),
            type: String(category).toUpperCase()
          });
        }
      }
    }
  }

  return flatInventory;
}

/* =========================================================
   GROUP INVENTORY
========================================================= */

function summarizeInventory(items) {
  const grouped = {};

  for (const item of items) {
    if (!item) {
      continue;
    }

    const name = cleanItemName(
      item.name || "Unknown"
    );

    const key = name.toLowerCase();

    if (!grouped[key]) {
      grouped[key] = {
        name: name,
        count: 0,
        type: item.type || "ITEM"
      };
    }

    grouped[key].count++;
  }

  return Object.values(grouped).sort(
    function (a, b) {
      return a.name.localeCompare(b.name);
    }
  );
}

/* =========================================================
   FIND ITEM COUNT
========================================================= */

function getGroupedItemCount(
  grouped,
  itemName
) {
  if (!Array.isArray(grouped)) {
    return 0;
  }

  const target = cleanItemName(itemName)
    .toLowerCase();

  const item = grouped.find(
    function (entry) {
      return String(entry.name || "")
        .trim()
        .toLowerCase() === target;
    }
  );

  return item
    ? Number(item.count || 0)
    : 0;
}

/* =========================================================
   AUTH
========================================================= */

async function authorizeBot(request, env) {
  const token =
    request.headers.get("Authorization");

  if (!token || !env.BOT_TOKEN) {
    return false;
  }

  return token === env.BOT_TOKEN;
}

/* =========================================================
   BOT KV
========================================================= */

async function getBot(env, username) {
  if (!username) {
    return null;
  }

  return await env.BOT_KV.get(
    "BOT:" + username,
    "json"
  );
}

async function saveBot(
  env,
  username,
  bot
) {
  await env.BOT_KV.put(
    "BOT:" + username,
    JSON.stringify(bot)
  );
}

/* =========================================================
   COMMAND KV
========================================================= */

async function getCommand(
  env,
  username
) {
  return await env.BOT_KV.get(
    "COMMAND:" + username,
    "json"
  );
}

async function saveCommand(
  env,
  username,
  command
) {
  await env.BOT_KV.put(
    "COMMAND:" + username,
    JSON.stringify(command)
  );
}

async function deleteCommand(
  env,
  username
) {
  await env.BOT_KV.delete(
    "COMMAND:" + username
  );
}

/* =========================================================
   SAVE INVENTORY
   Dipakai oleh:
   - /api/inventory
   - /api/telemetry jika telemetry membawa inventory
========================================================= */

async function saveInventory(
  env,
  username,
  inventory
) {
  const items =
    normalizeInventory(inventory);

  const grouped =
    summarizeInventory(items);

  const crystalEggCount =
    getGroupedItemCount(
      grouped,
      "Crystal Egg"
    );

  const inventoryData = {
    username: username,

    items: items,

    grouped: grouped,

    totalItems: items.length,

    crystalEggCount:
      crystalEggCount,

    updatedAt: Date.now()
  };

  await env.BOT_KV.put(
    "INVENTORY:" + username,
    JSON.stringify(inventoryData)
  );

  /*
   * Update ringkasan BOT
   */
  const bot =
    await getBot(env, username);

  if (bot) {
    bot.crystalEggCount =
      crystalEggCount;

    bot.inventoryUpdatedAt =
      inventoryData.updatedAt;

    bot.lastHeartbeat =
      Date.now();

    await saveBot(
      env,
      username,
      bot
    );
  }

  return inventoryData;
}

/* =========================================================
   TELEMETRY
========================================================= */

async function handleTelemetry(
  request,
  env
) {
  if (!(await authorizeBot(
    request,
    env
  ))) {
    return json(
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
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username =
    body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const oldBot =
    await getBot(
      env,
      username
    );

  const bot = {
    username: username,

    rf_location:
      body.rf_location ||
      oldBot?.rf_location ||
      "Unknown",

    status:
      body.status ||
      "ONLINE",

    bucks:
      Number(
        body.bucks ??
        oldBot?.bucks ??
        0
      ),

    crystalEggCount:
      Number(
        oldBot?.crystalEggCount ||
        0
      ),

    autotrade_status:
      body.autotrade_status !== undefined
        ? body.autotrade_status === true
        : oldBot?.autotrade_status === true,

    inventoryUpdatedAt:
      oldBot?.inventoryUpdatedAt ||
      0,

    lastHeartbeat:
      Date.now()
  };

  /*
   * Jika telemetry membawa inventory,
   * langsung simpan.
   *
   * Ini membuat behavior mirip
   * dengan server.js lama.
   */
  if (body.inventory) {
    const inventoryData =
      await saveInventory(
        env,
        username,
        body.inventory
      );

    bot.crystalEggCount =
      inventoryData.crystalEggCount;

    bot.inventoryUpdatedAt =
      inventoryData.updatedAt;
  }

  await saveBot(
    env,
    username,
    bot
  );

  /*
   * PENTING:
   *
   * Telemetry TIDAK mengambil command.
   *
   * Command hanya dikonsumsi oleh:
   * /api/command/poll
   *
   * Ini mencegah command refresh
   * hilang sebelum bot melakukan polling.
   */

  return json({
    success: true
  });
}

/* =========================================================
   INVENTORY UPLOAD
========================================================= */

async function handleInventory(
  request,
  env
) {
  if (!(await authorizeBot(
    request,
    env
  ))) {
    return json(
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
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username =
    body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  if (!body.inventory) {
    return json(
      {
        success: false,
        error: "Inventory tidak ditemukan"
      },
      400
    );
  }

  const inventoryData =
    await saveInventory(
      env,
      username,
      body.inventory
    );

  return json({
    success: true,

    totalItems:
      inventoryData.totalItems,

    crystalEggCount:
      inventoryData.crystalEggCount,

    updatedAt:
      inventoryData.updatedAt
  });
}

/* =========================================================
   COMMAND POLL
========================================================= */

async function handleCommandPoll(
  request,
  env
) {
  if (!(await authorizeBot(
    request,
    env
  ))) {
    return json(
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
    url.searchParams.get(
      "username"
    );

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const command =
    await getCommand(
      env,
      username
    );

  if (!command) {
    return json({
      success: true,
      command: null
    });
  }

  /*
   * Command hanya dihapus
   * setelah berhasil diambil.
   */
  await deleteCommand(
    env,
    username
  );

  return json({
    success: true,
    command: command
  });
}

/* =========================================================
   REQUEST INVENTORY
========================================================= */

async function handleInventoryCommand(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username =
    body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Username wajib diisi"
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
    return json(
      {
        success: false,
        error: "Bot tidak ditemukan"
      },
      404
    );
  }

  /*
   * Jangan menumpuk command
   * REQUEST_INVENTORY yang sama.
   */
  const existingCommand =
    await getCommand(
      env,
      username
    );

  if (
    !existingCommand ||
    existingCommand.type !==
      "REQUEST_INVENTORY"
  ) {
    await saveCommand(
      env,
      username,
      {
        type:
          "REQUEST_INVENTORY",

        createdAt:
          Date.now()
      }
    );
  }

  return json({
    success: true,
    message:
      "Perintah refresh inventory dikirim"
  });
}

/* =========================================================
   CONFIG COMMAND
========================================================= */

async function handleConfigCommand(
  request,
  env
) {
  let body;

  try {
    body =
      await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username =
    body.bot_username;

  if (!username) {
    return json(
      {
        success: false,
        error:
          "bot_username wajib diisi"
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
    return json(
      {
        success: false,
        error:
          "Bot tidak ditemukan"
      },
      404
    );
  }

  const command = {
    type:
      "UPDATE_CONFIG",

    autotrade:
      body.autotrade === true,

    item_target:
      body.item_target || "",

    receiver:
      body.receiver || "",

    createdAt:
      Date.now()
  };

  await saveCommand(
    env,
    username,
    command
  );

  /*
   * Dashboard langsung mencerminkan
   * status yang diminta.
   */
  bot.autotrade_status =
    command.autotrade;

  await saveBot(
    env,
    username,
    bot
  );

  return json({
    success: true,
    message:
      "Config berhasil dikirim"
  });
}

/* =========================================================
   GET INVENTORY BOT
========================================================= */

async function handleGetInventory(
  request,
  env
) {
  const url =
    new URL(request.url);

  const parts =
    url.pathname.split("/");

  const username =
    decodeURIComponent(
      parts[parts.length - 1]
    );

  if (!username) {
    return json(
      {
        success: false,
        error:
          "Username tidak ditemukan"
      },
      400
    );
  }

  const inventory =
    await env.BOT_KV.get(
      "INVENTORY:" + username,
      "json"
    );

  if (!inventory) {
    return json({
      success: true,
      inventory: null
    });
  }

  return json({
    success: true,
    inventory: inventory
  });
}

/* =========================================================
   DASHBOARD DATA
========================================================= */

async function handleDashboardData(
  env
) {
  const now =
    Date.now();

  const result = [];

  let cursor =
    undefined;

  do {
    const options = {
      prefix: "BOT:"
    };

    if (cursor) {
      options.cursor =
        cursor;
    }

    const list =
      await env.BOT_KV.list(
        options
      );

    for (const key of list.keys) {
      const username =
        key.name.substring(4);

      const bot =
        await env.BOT_KV.get(
          key.name,
          "json"
        );

      if (!bot) {
        continue;
      }

      const lastHeartbeat =
        Number(
          bot.lastHeartbeat ||
          0
        );

      const age =
        now - lastHeartbeat;

      /*
       * Hapus bot yang sudah
       * tidak aktif selama 7 hari.
       */
      if (
        age >
        DELETE_THRESHOLD
      ) {
        await env.BOT_KV.delete(
          key.name
        );

        await env.BOT_KV.delete(
          "INVENTORY:" +
            username
        );

        await env.BOT_KV.delete(
          "COMMAND:" +
            username
        );

        continue;
      }

      const currentStatus =
        age >
        OFFLINE_THRESHOLD
          ? "OFFLINE"
          : (
              bot.status ||
              "ONLINE"
            );

      /*
       * Ambil inventory cache.
       *
       * Ini membuat tombol TAS
       * tidak perlu menunggu bot.
       */
      const inventory =
        await env.BOT_KV.get(
          "INVENTORY:" +
            username,
          "json"
        );

      const groupedInventory =
        inventory?.grouped ||
        [];

      /*
       * Buat map item:
       *
       * {
       *   "Crystal Egg": 5,
       *   "Alicorn": 2
       * }
       */
      const itemCounts = {};

      for (
        const item
        of groupedInventory
      ) {
        if (!item) {
          continue;
        }

        const itemName =
          cleanItemName(
            item.name ||
              "Unknown"
          );

        itemCounts[
          itemName
        ] =
          Number(
            item.count || 0
          );
      }

      result.push({
        username:
          username,

        rf_location:
          bot.rf_location ||
          "Unknown",

        status:
          currentStatus,

        bucks:
          Number(
            bot.bucks || 0
          ),

        /*
         * Tetap dikirim agar
         * dashboard lama tetap kompatibel.
         */
        crystalEggCount:
          Number(
            bot.crystalEggCount ||
              getGroupedItemCount(
                groupedInventory,
                "Crystal Egg"
              )
          ),

        autotrade_status:
          bot.autotrade_status ===
          true,

        lastHeartbeat:
          lastHeartbeat,

        /*
         * INVENTORY GENERIC
         */
        groupedInventory:
          groupedInventory,

        itemCounts:
          itemCounts,

        inventoryUpdatedAt:
          Number(
            inventory?.updatedAt ||
              bot.inventoryUpdatedAt ||
              0
          )
      });
    }

    if (
      list.list_complete
    ) {
      cursor =
        undefined;
    } else {
      cursor =
        list.cursor;
    }

  } while (cursor);

  /*
   * SORT:
   * RF → Username
   */
  result.sort(
    function (a, b) {
      const rfA =
        String(
          a.rf_location ||
            ""
        ).trim();

      const rfB =
        String(
          b.rf_location ||
            ""
        ).trim();

      const rfCompare =
        rfA.localeCompare(
          rfB
        );

      if (
        rfCompare !== 0
      ) {
        return rfCompare;
      }

      return a.username.localeCompare(
        b.username
      );
    }
  );

  /*
   * STATISTIK BOT
   */
  let totalBucks =
    0;

  let totalCrystalEggs =
    0;

  let onlineBots =
    0;

  let offlineBots =
    0;

  /*
   * TOTAL SEMUA ITEM
   *
   * Contoh:
   *
   * itemTotals["Alicorn"] = 7
   * itemTotals["Crystal Egg"] = 15
   */
  const itemTotals = {};

  for (
    const bot
    of result
  ) {
    totalBucks +=
      Number(
        bot.bucks || 0
      );

    totalCrystalEggs +=
      Number(
        bot.crystalEggCount ||
          0
      );

    if (
      bot.status ===
      "ONLINE"
    ) {
      onlineBots++;
    } else {
      offlineBots++;
    }

    /*
     * Gabungkan inventory
     * seluruh bot.
     */
    for (
      const itemName
      in bot.itemCounts
    ) {
      if (
        !itemTotals[itemName]
      ) {
        itemTotals[itemName] =
          0;
      }

      itemTotals[itemName] +=
        Number(
          bot.itemCounts[
            itemName
          ] || 0
        );
    }
  }

  /*
   * Urutkan item berdasarkan nama.
   */
  const sortedItemTotals = {};

  Object.keys(
    itemTotals
  )
    .sort(
      function (a, b) {
        return a.localeCompare(
          b
        );
      }
    )
    .forEach(
      function (name) {
        sortedItemTotals[
          name
        ] =
          itemTotals[name];
      }
    );

  return {
    success: true,

    bots:
      result,

    totalBots:
      result.length,

    onlineBots:
      onlineBots,

    offlineBots:
      offlineBots,

    totalBucks:
      totalBucks,

    /*
     * Kompatibilitas dashboard lama.
     */
    totalCrystalEggs:
      totalCrystalEggs,

    /*
     * DATA GENERIC
     */
    itemTotals:
      sortedItemTotals,

    serverTime:
      now
  };
}

/* =========================================================
   FETCH
========================================================= */

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(request.url);

    /*
     * CORS
     */
    if (
      request.method ===
      "OPTIONS"
    ) {
      return json({
        success: true
      });
    }

    /*
     * HEALTH
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/api/health"
    ) {
      return json({
        success: true,

        worker:
          "online",

        kv:
          !!env.BOT_KV,

        botTokenConfigured:
          !!env.BOT_TOKEN,

        time:
          Date.now()
      });
    }

    /*
     * TELEMETRY
     */
    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/api/telemetry"
    ) {
      return handleTelemetry(
        request,
        env
      );
    }

    /*
     * INVENTORY UPLOAD
     */
    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/api/inventory"
    ) {
      return handleInventory(
        request,
        env
      );
    }

    /*
     * COMMAND POLL
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/api/command/poll"
    ) {
      return handleCommandPoll(
        request,
        env
      );
    }

    /*
     * DASHBOARD DATA
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/api/dashboard/data"
    ) {
      try {
        const data =
          await handleDashboardData(
            env
          );

        return json(
          data
        );

      } catch (error) {
        return json(
          {
            success: false,
            error:
              error.message
          },
          500
        );
      }
    }

    /*
     * REQUEST INVENTORY
     */
    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/api/command/inventory"
    ) {
      return handleInventoryCommand(
        request,
        env
      );
    }

    /*
     * CONFIG COMMAND
     */
    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/api/command/config"
    ) {
      return handleConfigCommand(
        request,
        env
      );
    }

    /*
     * GET INVENTORY
     */
    if (
      request.method ===
        "GET" &&
      url.pathname.startsWith(
        "/api/inventory/"
      )
    ) {
      return handleGetInventory(
        request,
        env
      );
    }

    /*
     * MASTER ITEMS
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/api/master-items"
    ) {
      return json({
        success: true,
        items:
          MASTER_ADOPT_ME_ITEMS
      });
    }

    /*
     * DASHBOARD
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/"
    ) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(
          request
        );
      }

      return new Response(
        "Dashboard belum terhubung ke Assets.",
        {
          status: 503,

          headers: {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }

    /*
     * UNKNOWN ENDPOINT
     */
    return json(
      {
        success: false,
        error:
          "Endpoint tidak ditemukan"
      },
      404
    );
  }
};
