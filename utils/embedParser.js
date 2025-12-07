const { EmbedBuilder } = require('discord.js');

/**
 * Validates and converts a JSON object into a Discord EmbedBuilder
 * @param {Object} data - The raw JSON embed object
 * @returns {EmbedBuilder}
 */
function parseEmbed(data) {
    if (!data) return null;

    const embed = new EmbedBuilder();

    if (data.title) embed.setTitle(String(data.title).substring(0, 256));
    if (data.description) embed.setDescription(String(data.description).substring(0, 4096));
    if (data.url) embed.setURL(data.url);

    // Color: Hex string or integer
    if (data.color) {
        embed.setColor(data.color);
    }

    if (data.timestamp) {
        embed.setTimestamp(new Date(data.timestamp));
    }

    if (data.footer && data.footer.text) {
        embed.setFooter({
            text: String(data.footer.text).substring(0, 2048),
            iconURL: data.footer.icon_url || undefined
        });
    }

    if (data.image && data.image.url) {
        embed.setImage(data.image.url);
    }

    if (data.thumbnail && data.thumbnail.url) {
        embed.setThumbnail(data.thumbnail.url);
    }

    if (data.author && data.author.name) {
        embed.setAuthor({
            name: String(data.author.name).substring(0, 256),
            url: data.author.url || undefined,
            iconURL: data.author.icon_url || undefined
        });
    }

    if (Array.isArray(data.fields)) {
        const validFields = data.fields
            .filter(f => f.name && f.value)
            .map(f => ({
                name: String(f.name).substring(0, 256),
                value: String(f.value).substring(0, 1024),
                inline: !!f.inline
            }))
            .slice(0, 25); // Max 25 fields

        if (validFields.length > 0) {
            embed.addFields(validFields);
        }
    }

    return embed;
}

module.exports = { parseEmbed };
