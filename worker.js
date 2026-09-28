
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

function cleanItemName(rawName) {
  if (!rawName) {
    return "Unknown";
  }

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
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeInventory(inventory) {
  const flatInventory = [];

  if (!inventory) {
    return flatInventory;
  }

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
        type: item.type || item.category || "ITEM"
      });
    }

    return flatInventory;
  }

  if (typeof inventory === "object") {
    for (const category in inventory) {
      const categoryData = inventory[category];

      if (!categoryData || typeof categoryData !== "object") {
        continue;
      }

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
            type: category.toUpperCase()
          });
        }
      } else {
        for (const id in categoryData) {
          const item = categoryData[id];

          if (!item) {
            continue;
          }

          flatInventory.push({
            id: id,
            name: cleanItemName(
              item.kind ||
              item.name ||
              item.itemName ||
              item.displayName ||
              category
            ),
            type: category.toUpperCase()
          });
        }
      }
    }
  }

  return flatInventory;
}

function summarizeInventory(items) {
  const grouped = {};

  for (const item of items) {
    const name = item.name || "Unknown";

    if (!grouped[name]) {
      grouped[name] = {
        name: name,
        count: 0,
        type: item.type || "ITEM"
      };
    }

    grouped[name].count++;
  }

  return Object.values(grouped).sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
}

async function authorizeBot(request, env) {
  const token = request.headers.get("Authorization");

  if (!token || !env.BOT_TOKEN) {
    return false;
  }

  return token === env.BOT_TOKEN;
}

async function getBot(env, username) {
  if (!username) {
    return null;
  }

  return await env.BOT_KV.get(
    "BOT:" + username,
    "json"
  );
}

async function saveBot(env, username, bot) {
  await env.BOT_KV.put(
    "BOT:" + username,
    JSON.stringify(bot)
  );
}

async function getCommand(env, username) {
  return await env.BOT_KV.get(
    "COMMAND:" + username,
    "json"
  );
}

async function saveCommand(env, username, command) {
  await env.BOT_KV.put(
    "COMMAND:" + username,
    JSON.stringify(command)
  );
}

async function deleteCommand(env, username) {
  await env.BOT_KV.delete(
    "COMMAND:" + username
  );
}

async function handleTelemetry(request, env) {
  if (!(await authorizeBot(request, env))) {
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
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username = body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const oldBot = await getBot(env, username);

  const bot = {
    username: username,
    rf_location: body.rf_location || "Unknown",
    status: body.status || "ONLINE",
    bucks: Number(body.bucks || 0),
    crystalEggCount: Number(
      body.crystalEggCount || 0
    ),
    autotrade_status:
      body.autotrade_status === true,
    lastHeartbeat: Date.now()
  };

  if (oldBot) {
    bot.autotrade_status =
      body.autotrade_status !== undefined
        ? body.autotrade_status === true
        : oldBot.autotrade_status === true;
  }

  await saveBot(env, username, bot);

  const command = await getCommand(env, username);

  if (command) {
    await deleteCommand(env, username);
  }

  return json({
    success: true,
    command: command || null
  });
}

async function handleInventory(request, env) {
  if (!(await authorizeBot(request, env))) {
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
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username = body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const items = normalizeInventory(body.inventory);
  const grouped = summarizeInventory(items);

  let crystalEggCount = 0;

  for (const item of grouped) {
    if (
      item.name.toLowerCase().includes("crystal") &&
      item.name.toLowerCase().includes("egg")
    ) {
      crystalEggCount = item.count;
      break;
    }
  }

  const inventoryData = {
    username: username,
    items: items,
    grouped: grouped,
    totalItems: items.length,
    crystalEggCount: crystalEggCount,
    updatedAt: Date.now()
  };

  await env.BOT_KV.put(
    "INVENTORY:" + username,
    JSON.stringify(inventoryData)
  );

  const bot = await getBot(env, username);

  if (bot) {
    bot.crystalEggCount = crystalEggCount;
    bot.lastHeartbeat = Date.now();

    await saveBot(env, username, bot);
  }

  return json({
    success: true,
    totalItems: items.length,
    crystalEggCount: crystalEggCount
  });
}

async function handleCommandPoll(request, env) {
  if (!(await authorizeBot(request, env))) {
    return json(
      {
        success: false,
        error: "Unauthorized"
      },
      401
    );
  }

  const url = new URL(request.url);
  const username = url.searchParams.get("username");

  if (!username) {
    return json(
      {
        success: false,
        error: "Missing username"
      },
      400
    );
  }

  const command = await getCommand(env, username);

  if (!command) {
    return json({
      success: true,
      command: null
    });
  }

  await deleteCommand(env, username);

  return json({
    success: true,
    command: command
  });
}

async function handleInventoryCommand(request, env) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username = body.username;

  if (!username) {
    return json(
      {
        success: false,
        error: "Username wajib diisi"
      },
      400
    );
  }

  const bot = await getBot(env, username);

  if (!bot) {
    return json(
      {
        success: false,
        error: "Bot tidak ditemukan"
      },
      404
    );
  }

  await saveCommand(
    env,
    username,
    {
      type: "REQUEST_INVENTORY",
      createdAt: Date.now()
    }
  );

  return json({
    success: true,
    message: "Perintah refresh inventory dikirim"
  });
}

async function handleConfigCommand(request, env) {
  let body;

  try {
    body = await request.json();
  } catch (error) {
    return json(
      {
        success: false,
        error: "Invalid JSON"
      },
      400
    );
  }

  const username = body.bot_username;

  if (!username) {
    return json(
      {
        success: false,
        error: "bot_username wajib diisi"
      },
      400
    );
  }

  const bot = await getBot(env, username);

  if (!bot) {
    return json(
      {
        success: false,
        error: "Bot tidak ditemukan"
      },
      404
    );
  }

  const command = {
    type: "UPDATE_CONFIG",
    autotrade: body.autotrade === true,
    item_target: body.item_target || "",
    receiver: body.receiver || "",
    createdAt: Date.now()
  };

  await saveCommand(
    env,
    username,
    command
  );

  bot.autotrade_status = command.autotrade;

  await saveBot(
    env,
    username,
    bot
  );

  return json({
    success: true,
    message: "Config berhasil dikirim"
  });
}

async function handleGetInventory(request, env) {
  const url = new URL(request.url);

  const parts = url.pathname.split("/");
  const username = decodeURIComponent(
    parts[parts.length - 1]
  );

  if (!username) {
    return json(
      {
        success: false,
        error: "Username tidak ditemukan"
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

async function handleDashboardData(env) {
  const now = Date.now();

  const result = [];
  let cursor = undefined;

  do {
    const options = {
      prefix: "BOT:"
    };

    if (cursor) {
      options.cursor = cursor;
    }

    const list = await env.BOT_KV.list(options);

    for (const key of list.keys) {
      const username = key.name.substring(4);

      const bot = await env.BOT_KV.get(
        key.name,
        "json"
      );

      if (!bot) {
        continue;
      }

      const lastHeartbeat = Number(
        bot.lastHeartbeat || 0
      );

      const age = now - lastHeartbeat;

      if (age > DELETE_THRESHOLD) {
        await env.BOT_KV.delete(key.name);

        await env.BOT_KV.delete(
          "INVENTORY:" + username
        );

        await env.BOT_KV.delete(
          "COMMAND:" + username
        );

        continue;
      }

      const currentStatus =
        age > OFFLINE_THRESHOLD
          ? "OFFLINE"
          : (bot.status || "ONLINE");

      result.push({
        username: username,
        rf_location: bot.rf_location || "Unknown",
        status: currentStatus,
        bucks: Number(bot.bucks || 0),
        crystalEggCount: Number(
          bot.crystalEggCount || 0
        ),
        autotrade_status:
          bot.autotrade_status === true,
        lastHeartbeat: lastHeartbeat
      });
    }

    if (list.list_complete) {
      cursor = undefined;
    } else {
      cursor = list.cursor;
    }

  } while (cursor);

  result.sort(function (a, b) {
    const rfA = String(
      a.rf_location || ""
    ).trim();

    const rfB = String(
      b.rf_location || ""
    ).trim();

    const rfCompare =
      rfA.localeCompare(rfB);

    if (rfCompare !== 0) {
      return rfCompare;
    }

    return a.username.localeCompare(
      b.username
    );
  });

  let totalBucks = 0;
  let totalCrystalEggs = 0;
  let onlineBots = 0;
  let offlineBots = 0;

  for (const bot of result) {
    totalBucks += Number(
      bot.bucks || 0
    );

    totalCrystalEggs += Number(
      bot.crystalEggCount || 0
    );

    if (bot.status === "ONLINE") {
      onlineBots++;
    } else {
      offlineBots++;
    }
  }

  return {
    success: true,
    bots: result,
    totalBots: result.length,
    onlineBots: onlineBots,
    offlineBots: offlineBots,
    totalBucks: totalBucks,
    totalCrystalEggs: totalCrystalEggs,
    serverTime: now
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json({
        success: true
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return json({
        success: true,
        worker: "online",
        kv: !!env.BOT_KV,
        botTokenConfigured:
          !!env.BOT_TOKEN,
        time: Date.now()
      });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/telemetry"
    ) {
      return handleTelemetry(
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/inventory"
    ) {
      return handleInventory(
        request,
        env
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/command/poll"
    ) {
      return handleCommandPoll(
        request,
        env
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/dashboard/data"
    ) {
      try {
        const data =
          await handleDashboardData(env);

        return json(data);
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/command/inventory"
    ) {
      return handleInventoryCommand(
        request,
        env
      );
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/command/config"
    ) {
      return handleConfigCommand(
        request,
        env
      );
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith(
        "/api/inventory/"
      )
    ) {
      return handleGetInventory(
        request,
        env
      );
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/master-items"
    ) {
      return json({
        success: true,
        items: MASTER_ADOPT_ME_ITEMS
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
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

    return json(
      {
        success: false,
        error: "Endpoint tidak ditemukan"
      },
      404
    );
  }
};
