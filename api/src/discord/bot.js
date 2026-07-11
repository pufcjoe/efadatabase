// ============================================================
// EFA Discord verification bot (Bloxlink replacement)
// ============================================================
// Truth lives in the players table: discord_id is only ever set
// via Roblox OAuth → "Link Discord" on the panel, so a linked row
// IS proof of Roblox ownership — stronger than Bloxlink's flow.
//
// The bot:
//   /verify        — ephemeral instructions + panel link
//   /update        — re-sync your own nickname + roles
//   /whois @user   — staff+: show the linked Roblox account
//   member join    — auto-sync if they're already linked
//   instant sync   — the API calls syncMember() right after a
//                    successful link on the website
//
// Runs inside the API process — no separate hosting needed.
// ============================================================

const {
    Client, GatewayIntentBits, REST, Routes,
    SlashCommandBuilder, PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { supabase } = require('../database/db');

let client = null;

// Role flags → Discord role env vars (all optional; unset = skipped)
const FLAG_ROLES = [
    ['is_owner', 'ROLE_OWNER_ID'],
    ['is_board', 'ROLE_BOARD_ID'],
    ['is_developer', 'ROLE_DEVELOPER_ID'],
    ['is_staff', 'ROLE_STAFF_ID'],
    ['is_manager', 'ROLE_MANAGER_ID']
];

function managedRoleIds() {
    const ids = FLAG_ROLES.map(([, env]) => process.env[env]).filter(Boolean);
    if (process.env.VERIFIED_ROLE_ID) ids.push(process.env.VERIFIED_ROLE_ID);
    return ids;
}

async function playerByDiscordId(discordId) {
    const { data } = await supabase
        .from('players').select('*').eq('discord_id', discordId).maybeSingle();
    return data;
}

/**
 * Bring one guild member in line with their database row:
 * nickname = Roblox username, roles = Verified + role flags.
 * Banned players get all managed roles stripped.
 * Returns { ok, message } for command replies.
 */
async function syncMember(discordId) {
    if (!client?.isReady()) return { ok: false, message: 'Bot not ready.' };

    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) return { ok: false, message: 'Guild not found — check DISCORD_GUILD_ID.' };

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return { ok: false, message: 'You need to be in the EFA server.' };

    const player = await playerByDiscordId(discordId);
    if (!player) return { ok: false, message: 'not_linked' };

    // Nickname → Roblox username (fails harmlessly on members above the bot, e.g. the server owner)
    if (player.username && member.nickname !== player.username) {
        await member.setNickname(player.username).catch(() => {});
    }

    // Work out which managed roles they SHOULD have
    const should = new Set();
    if (!player.is_banned) {
        if (process.env.VERIFIED_ROLE_ID) should.add(process.env.VERIFIED_ROLE_ID);
        for (const [flag, env] of FLAG_ROLES) {
            if (player[flag] && process.env[env]) should.add(process.env[env]);
        }
    }

    // Apply the diff, only touching roles this bot manages
    const managed = managedRoleIds();
    const toAdd = [...should].filter(id => !member.roles.cache.has(id));
    const toRemove = managed.filter(id => member.roles.cache.has(id) && !should.has(id));

    if (toAdd.length) await member.roles.add(toAdd).catch(err => console.error('[EFA bot] role add failed:', err.message));
    if (toRemove.length) await member.roles.remove(toRemove).catch(err => console.error('[EFA bot] role remove failed:', err.message));

    if (player.is_banned) return { ok: true, message: `Synced — **${player.username}** is banned, roles removed.` };
    return { ok: true, message: `Verified as **${player.username}**.` };
}

// ---- slash commands -----------------------------------------

const commands = [
    new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Link your Roblox account to get verified'),
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('Re-sync your nickname and roles with the EFA database'),
    new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Show the Roblox account linked to a Discord user')
        .addUserOption(o => o.setName('user').setDescription('Discord user').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
];

const PANEL = () => process.env.PANEL_URL || 'https://www.europeanfootballassociation.com';

async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'verify') {
            // Already linked? Just sync them.
            const existing = await playerByDiscordId(interaction.user.id);
            if (existing) {
                const res = await syncMember(interaction.user.id);
                return interaction.reply({ content: res.message, flags: MessageFlags.Ephemeral });
            }
            return interaction.reply({
                flags: MessageFlags.Ephemeral,
                content:
                    `**Verify your Roblox account:**\n` +
                    `1. Go to ${PANEL()}\n` +
                    `2. **Sign in with Roblox**\n` +
                    `3. Open **My profile** → hit **Link** next to Discord\n` +
                    `4. Run **/update** here\n\n` +
                    `Your roles and nickname sync automatically after linking.`
            });
        }

        if (interaction.commandName === 'update') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const res = await syncMember(interaction.user.id);
            const msg = res.message === 'not_linked'
                ? `You haven't linked yet — run **/verify** for instructions.`
                : res.message;
            return interaction.editReply(msg);
        }

        if (interaction.commandName === 'whois') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const target = interaction.options.getUser('user');
            const player = await playerByDiscordId(target.id);
            if (!player) return interaction.editReply(`<@${target.id}> has no linked Roblox account.`);
            return interaction.editReply(
                `<@${target.id}> → **${player.username}** (\`${player.user_id}\`)\n` +
                `Team: ${player.team} · Country: ${player.country}` +
                (player.is_banned ? ' · **BANNED**' : '')
            );
        }
    } catch (err) {
        console.error('[EFA bot] interaction error:', err);
        const reply = { content: 'Something went wrong — try again.', flags: MessageFlags.Ephemeral };
        interaction.deferred ? interaction.editReply(reply).catch(() => {}) : interaction.reply(reply).catch(() => {});
    }
}

// ---- lifecycle ----------------------------------------------

function start() {
    if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) {
        console.log('[EFA bot] DISCORD_BOT_TOKEN / DISCORD_GUILD_ID not set — bot disabled.');
        return;
    }

    client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

    client.once('clientReady', async () => {
        console.log(`[EFA bot] Logged in as ${client.user.tag}`);
        // Register guild commands on every boot (instant, no global propagation wait)
        const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, process.env.DISCORD_GUILD_ID),
            { body: commands.map(c => c.toJSON()) }
        ).catch(err => console.error('[EFA bot] command registration failed:', err.message));
    });

    client.on('interactionCreate', handleInteraction);

    // Auto-verify people who linked before joining the server
    client.on('guildMemberAdd', member => {
        syncMember(member.id).catch(() => {});
    });

    client.login(process.env.DISCORD_BOT_TOKEN)
        .catch(err => console.error('[EFA bot] login failed:', err.message));
}

module.exports = { start, syncMember };
