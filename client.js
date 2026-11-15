const socket = io();
const $ = id => document.getElementById(id);

let engine, scene, camera, me, lobby;
let players = new Map();
let match = false;

let yaw = 0;
let pitch = 0;
let keys = {};
let lastMove = 0;

let health = 100, kills = 0, deaths = 0;
let velocity = new BABYLON.Vector3(0, 0, 0);
let velocityY = 0;
let grounded = true;
let moving = false;
let animationTime = 0;

const obstacles = [];
const PLAYER_RADIUS = 0.48;
const WALK_SPEED = 7.5;
const SPRINT_SPEED = 12;
const GRAVITY = 23;
const JUMP_POWER = 9;

function material(color) {
  const m = new BABYLON.StandardMaterial(
    "mat" + Math.random(), scene
  );
  m.diffuseColor = BABYLON.Color3.FromHexString(color);
  return m;
}

function cube(parent, name, w, h, d, x, y, z, mat) {
  const m = BABYLON.MeshBuilder.CreateBox(name, {
    width: w, height: h, depth: d
  }, scene);

  m.position.set(x, y, z);
  m.material = mat;

  if (parent) m.parent = parent;
  return m;
}

function avatar(id, name, color = "#d6a13b") {
  const root = new BABYLON.TransformNode("avatar-" + id, scene);

  const shirt = material(color);
  const skin = material("#d7a77e");
  const pants = material("#273449");

  const body = cube(root, "body", .9, 1.1, .45,
    0, 1.45, 0, shirt);

  cube(root, "head", .65, .65, .65,
    0, 2.35, 0, skin);

  const leftArm = new BABYLON.TransformNode("left-arm-pivot", scene);
  leftArm.parent = root;
  leftArm.position.set(-.6, 1.9, 0);

  cube(leftArm, "left-arm", .3, .95, .35,
    0, -.45, 0, skin);

  const rightArm = new BABYLON.TransformNode("right-arm-pivot", scene);
  rightArm.parent = root;
  rightArm.position.set(.6, 1.9, 0);

  cube(rightArm, "right-arm", .3, .95, .35,
    0, -.45, 0, skin);

  const leftLeg = new BABYLON.TransformNode("left-leg-pivot", scene);
  leftLeg.parent = root;
  leftLeg.position.set(-.23, .9, 0);

  cube(leftLeg, "left-leg", .38, .9, .4,
    0, -.45, 0, pants);

  const rightLeg = new BABYLON.TransformNode("right-leg-pivot", scene);
  rightLeg.parent = root;
  rightLeg.position.set(.23, .9, 0);

  cube(rightLeg, "right-leg", .38, .9, .4,
    0, -.45, 0, pants);

  const tag = BABYLON.MeshBuilder.CreatePlane("name-tag", {
    width: 2.2, height: .4
  }, scene);

  tag.parent = root;
  tag.position.y = 3.05;
  tag.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;

  const texture = new BABYLON.DynamicTexture(
    "name-text", { width: 512, height: 128 }, scene
  );

  texture.drawText(
    String(name).slice(0, 16),
    null, 88, "bold 55px Arial",
    "white", "transparent", true
  );

  const tm = new BABYLON.StandardMaterial("tag-material", scene);
  tm.diffuseTexture = texture;
  tm.emissiveColor = new BABYLON.Color3(1, 1, 1);
  tm.disableLighting = true;
  tm.backFaceCulling = false;
  tag.material = tm;

  return {
    root,
    name,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    target: root.position.clone(),
    targetYaw: 0,
    isMoving: false
  };
}

function animateAvatar(obj, dt, isMoving) {
  if (isMoving) {
    animationTime += dt * 10;

    const swing = Math.sin(animationTime) * .65;

    obj.leftArm.rotation.x = swing;
    obj.rightArm.rotation.x = -swing;

    obj.leftLeg.rotation.x = -swing;
    obj.rightLeg.rotation.x = swing;
  } else {
    obj.leftArm.rotation.x *= .8;
    obj.rightArm.rotation.x *= .8;
    obj.leftLeg.rotation.x *= .8;
    obj.rightLeg.rotation.x *= .8;
  }
}

function environment() {
  scene.clearColor = new BABYLON.Color4(.35, .49, .59, 1);

  const hemi = new BABYLON.HemisphericLight(
    "hemi", new BABYLON.Vector3(0, 1, 0), scene
  );
  hemi.intensity = .95;

  const sun = new BABYLON.DirectionalLight(
    "sun", new BABYLON.Vector3(-.5, -1, .3), scene
  );
  sun.intensity = 1.1;

  const ground = BABYLON.MeshBuilder.CreateGround("ground", {
    width: 150, height: 150
  }, scene);

  ground.material = material("#465c53");

  const platform = BABYLON.MeshBuilder.CreateCylinder("platform", {
    diameter: 7, height: .35, tessellation: 48
  }, scene);

  platform.position.y = .18;
  platform.material = material("#253443");

  const ring = BABYLON.MeshBuilder.CreateTorus("ring", {
    diameter: 7.2, thickness: .08
  }, scene);

  ring.position.y = .38;
  ring.material = material("#d9a33e");

  const building = material("#687783");
  const dark = material("#293d4a");
  const tree = material("#294b3e");

  for (let i = 0; i < 34; i++) {
    const x = Math.random() * 100 - 50;
    const z = Math.random() * 100 - 50;

    if (Math.hypot(x, z) < 12) continue;

    const h = 4 + Math.random() * 9;

    cube(null, "building", 5, h, 5,
      x, h / 2, z, building);

    cube(null, "window", 5.1, .12, 5.1,
      x, h * .55, z, dark);

    obstacles.push({ x, z, halfX: 2.8, halfZ: 2.8 });

    if (i % 3 === 0) {
      cube(null, "tree-trunk", .5, 2, .5,
        x, 1, z + 5, building);

      const leaves = BABYLON.MeshBuilder.CreateSphere(
        "tree-leaves", { diameter: 3 }, scene
      );

      leaves.position.set(x, 3, z + 5);
      leaves.material = tree;
    }
  }

  const sky = BABYLON.MeshBuilder.CreateBox("skybox", {
    size: 500
  }, scene);

  sky.isPickable = false;
  sky.infiniteDistance = true;

  const skyMat = new BABYLON.StandardMaterial("sky-material", scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;
  skyMat.emissiveColor = new BABYLON.Color3(.35, .49, .59);
  sky.material = skyMat;
}

function collides(x, z) {
  if (Math.abs(x) > 72 || Math.abs(z) > 72) return true;

  for (const o of obstacles) {
    if (
      Math.abs(x - o.x) < o.halfX + PLAYER_RADIUS &&
      Math.abs(z - o.z) < o.halfZ + PLAYER_RADIUS
    ) return true;
  }

  return false;
}

function setupScene() {
  const canvas = $("renderCanvas");

  engine = new BABYLON.Engine(canvas, true);
  scene = new BABYLON.Scene(engine);

  environment();

  camera = new BABYLON.ArcRotateCamera(
    "player-camera",
    Math.PI / 2,
    1.08,
    8,
    new BABYLON.Vector3(0, 1.4, 0),
    scene
  );

  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 12;
  camera.lowerBetaLimit = .65;
  camera.upperBetaLimit = 1.5;
  camera.inputs.clear();

  camera.panningSensibility = 0;

  me = avatar("local", "PLAYER");
  me.root.position.set(0, 0, 0);

  engine.runRenderLoop(() => {
    if (!scene) return;

    const dt = Math.min(engine.getDeltaTime() / 1000, .05);

    if (match) {
      movePlayer(dt);
      updateRemotePlayers(dt);
    } else {
      me.root.rotation.y += .003;
      me.root.position.y = .04 +
        Math.sin(performance.now() * .0015) * .07;

      camera.alpha += .00025;
    }

    scene.render();
  });

  window.addEventListener("resize", () => engine.resize());
}

function updateRemotePlayers(dt) {
  for (const obj of players.values()) {
    const factor = 1 - Math.exp(-14 * dt);

    obj.root.position = BABYLON.Vector3.Lerp(
      obj.root.position,
      obj.target,
      factor
    );

    let diff = obj.targetYaw - obj.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));

    obj.root.rotation.y += diff * factor;

    animateAvatar(obj, dt, obj.isMoving);
  }
}

function updateParty(data) {
  lobby = data;

  $("partyCode").textContent = data.code;
  $("profileName").textContent = $("username").value.toUpperCase();

  const container = $("partyMembers");
  container.innerHTML = "";

  const present = new Set();

  data.players.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "party-member";

    const icon = document.createElement("div");
    icon.className = "member-icon";
    icon.textContent = p.name.slice(0, 1).toUpperCase();

    const info = document.createElement("div");
    const name = document.createElement("b");

    name.textContent = p.name + (p.id === data.host ? " ★" : "");

    const role = document.createElement("small");
    role.textContent = p.id === data.host
      ? "PARTY LEADER"
      : "PARTY MEMBER";

    info.append(name, role);
    div.append(icon, info);
    container.appendChild(div);

    if (p.id !== socket.id) {
      present.add(p.id);

      if (!players.has(p.id)) {
        const colors = ["#347caa", "#a14b4b", "#4b9874", "#8154a5"];
        const obj = avatar(p.id, p.name, colors[i % colors.length]);
        obj.root.position.set((i - 1) * 2, 0, 2);
        players.set(p.id, obj);
      }
    }
  });

  for (const [id, obj] of players) {
    if (!present.has(id)) {
      obj.root.dispose(false, true);
      players.delete(id);
    }
  }

  $("status").textContent = data.players.length + " PLAYER(S) IN PARTY";
  $("playButton").textContent =
    data.host === socket.id ? "PLAY NOW  ➜" : "WAITING FOR LEADER";
}

function showPage(page) {
  document.querySelectorAll(".nav").forEach(b => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  $("playOptions").hidden = page !== "play";
  $("otherPage").hidden = page === "play";

  const titles = {
    play: ["READY<br>FOR BATTLE?", "JOIN YOUR PARTY AND ENTER THE ARENA."],
    locker: ["YOUR<br>LOCKER", "CUSTOMIZE YOUR BLOCK OPS CHARACTER."],
    friends: ["YOUR<br>FRIENDS", "INVITE PLAYERS TO YOUR PARTY."],
    settings: ["GAME<br>SETTINGS", "CUSTOMIZE YOUR GAME EXPERIENCE."]
  };

  $("pageTitle").innerHTML = titles[page][0];
  $("pageDescription").textContent = titles[page][1];

  if (page === "locker") {
    $("pageContent").textContent = "CHARACTER: BLOCK OPERATOR";
  } else if (page === "friends") {
    $("pageContent").textContent = "SHARE YOUR PARTY CODE TO INVITE FRIENDS.";
  } else if (page === "settings") {
    $("pageContent").textContent = "WASD: MOVE | SHIFT: SPRINT | SPACE: JUMP";
  }
}

document.querySelectorAll(".nav").forEach(b => {
  b.onclick = () => showPage(b.dataset.page);
});

$("enterGame").onclick = () => {
  const name = $("firstName").value.trim().slice(0, 16) || "Player";
  $("username").value = name;
  $("profileName").textContent = name.toUpperCase();
  $("nameModal").hidden = true;
};

$("createParty").onclick = () => {
  socket.emit("lobby:create", $("username").value);
};

$("joinParty").onclick = () => {
  socket.emit("lobby:join", {
    code: $("joinCode").value.trim(),
    name: $("username").value
  });
};

$("copyCode").onclick = async () => {
  if (!lobby) return;

  try {
    await navigator.clipboard.writeText(lobby.code);
    $("copyCode").textContent = "COPIED!";
  } catch (e) {
    $("error").textContent = "COPY FAILED";
  }
};

$("playButton").onclick = () => {
  if (!lobby) {
    $("error").textContent = "CREATE OR JOIN A PARTY FIRST";
    return;
  }

  if (lobby.host !== socket.id) {
    $("error").textContent = "WAITING FOR PARTY LEADER";
    return;
  }

  socket.emit("match:start");
};

$("returnLobby").onclick = () => {
  document.exitPointerLock?.();

  match = false;
  $("matchUI").hidden = true;
  $("lobbyUI").hidden = false;

  velocity.set(0, 0, 0);
  velocityY = 0;
  grounded = true;

  camera.radius = 8;
  camera.alpha = Math.PI / 2 - yaw;
  camera.target.set(0, 1.4, 0);

  me.root.position.set(0, 0, 0);
};

socket.on("connect", () => {
  $("status").textContent = "CONNECTED";
});

socket.on("disconnect", () => {
  $("status").textContent = "DISCONNECTED";
});

socket.on("error:message", msg => {
  $("error").textContent = msg;
});

socket.on("lobby:joined", data => {
  updateParty(data);
  $("error").textContent = "";
});

socket.on("lobby:update", updateParty);

socket.on("match:started", () => {
  match = true;

  $("lobbyUI").hidden = true;
  $("matchUI").hidden = false;
  $("matchParty").textContent = "PARTY " + lobby.code;

  camera.radius = 8;
  camera.beta = 1.08;
  camera.alpha = Math.PI / 2 - yaw;

  $("captureMessage").style.display = "block";
});

socket.on("player:moved", p => {
  let obj = players.get(p.id);

  if (!obj) {
    obj = avatar(p.id, p.name, "#347caa");
    players.set(p.id, obj);
  }

  obj.target.set(p.x, p.y || 0, p.z);
  obj.targetYaw = p.yaw;
  obj.isMoving = !!p.moving;
});

socket.on("player:stats", data => {
  data.players.forEach(p => {
    if (p.id === socket.id) {
      health = p.hp;
      kills = p.kills;
      deaths = p.deaths;

      $("health").textContent = health;
      $("kills").textContent = kills;
      $("deaths").textContent = deaths;
    }

    const obj = players.get(p.id);

    if (obj) {
      obj.target.set(p.x, p.y || 0, p.z);
      obj.targetYaw = p.yaw;
    }
  });
});

document.addEventListener("keydown", e => {
  keys[e.code] = true;

  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) {
    if (match) e.preventDefault();
  }
});

document.addEventListener("keyup", e => {
  keys[e.code] = false;
});

window.addEventListener("blur", () => {
  keys = {};
});

document.addEventListener("mousemove", e => {
  if (!match || document.pointerLockElement !== $("renderCanvas")) return;

  yaw -= e.movementX * .002;
  pitch = Math.max(-.35, Math.min(.45, pitch + e.movementY * .002));

  camera.alpha = Math.PI / 2 - yaw;
  camera.beta = 1.08 + pitch;
});

$("renderCanvas").addEventListener("click", () => {
  if (match && document.pointerLockElement !== $("renderCanvas")) {
    $("renderCanvas").requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  $("captureMessage").style.display =
    document.pointerLockElement === $("renderCanvas") ? "none" : "block";
});

function movePlayer(dt) {
  let forward = 0;
  let side = 0;

  if (keys.KeyW) forward++;
  if (keys.KeyS) forward--;
  if (keys.KeyD) side++;
  if (keys.KeyA) side--;

  const length = Math.hypot(forward, side);

  if (length > 0) {
    forward /= length;
    side /= length;
  }

  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);

  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);

  const desiredX = (fx * forward + rx * side);
  const desiredZ = (fz * forward + rz * side);

  moving = length > 0;

  const sprinting = keys.ShiftLeft || keys.ShiftRight;
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;

  const acceleration = 1 - Math.exp(-13 * dt);

  velocity.x += (desiredX * speed - velocity.x) * acceleration;
  velocity.z += (desiredZ * speed - velocity.z) * acceleration;

  if (!moving) {
    velocity.x *= Math.exp(-9 * dt);
    velocity.z *= Math.exp(-9 * dt);
  }

  if (keys.Space && grounded) {
    velocityY = JUMP_POWER;
    grounded = false;
  }

  velocityY -= GRAVITY * dt;

  me.root.position.y += velocityY * dt;

  if (me.root.position.y <= 0) {
    me.root.position.y = 0;
    velocityY = 0;
    grounded = true;
  }

  const nextX = me.root.position.x + velocity.x * dt;
  const nextZ = me.root.position.z + velocity.z * dt;

  if (!collides(nextX, me.root.position.z)) {
    me.root.position.x = nextX;
  } else {
    velocity.x = 0;
  }

  if (!collides(me.root.position.x, nextZ)) {
    me.root.position.z = nextZ;
  } else {
    velocity.z = 0;
  }

  if (moving) {
    me.root.rotation.y = Math.atan2(
      -desiredX,
      -desiredZ
    );
  }

  animateAvatar(me, dt, moving);

  camera.alpha = Math.PI / 2 - yaw;
  camera.beta = 1.08 + pitch;

  camera.target.set(
    me.root.position.x,
    me.root.position.y + 1.4,
    me.root.position.z
  );

  if (performance.now() - lastMove > 50) {
    socket.emit("player:move", {
      x: me.root.position.x,
      y: me.root.position.y,
      z: me.root.position.z,
      yaw: me.root.rotation.y,
      moving
    });

    lastMove = performance.now();
  }
}

setupScene();
showPage("play");
