// netlify/functions/generate-rule.js
//
// Deze functie draait server-side op Netlify en houdt je Anthropic API-sleutel
// veilig uit de browser. Zet je sleutel als omgevingsvariabele in Netlify:
// Site settings -> Environment variables -> ANTHROPIC_API_KEY
//
// Controleer voor gebruik het actuele model-aanbod en de API-documentatie op
// https://docs.claude.com — het model hieronder kan inmiddels zijn opgevolgd.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY ontbreekt in de Netlify-omgevingsvariabelen.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ongeldige request body.' }) };
  }

  const { columnName, profileSummary, sampleValues, otherColumns } = payload;

  const prompt = `Je bent een data-kwaliteitsanalist die werkt met het NORA-kwaliteitsraamwerk.
De zes dimensies zijn: compleetheid, juistheid, consistentie, actualiteit, uniciteit, plausibiliteit.

Kolomnaam: ${columnName}
Profiling-samenvatting: ${JSON.stringify(profileSummary)}
Voorbeeldwaarden: ${JSON.stringify(sampleValues)}
Overige kolommen in de tabel: ${JSON.stringify(otherColumns || [])}

Geef 1 tot 3 aanvullende, betekenisvolle datakwaliteitsregels die pure statistiek niet zou vinden.
Denk aan semantische aannames op basis van de kolomnaam, of een logische relatie met een van de
overige kolommen (bijvoorbeeld een einddatum die niet vóór een begindatum mag liggen).
Sla voor de hand liggende dingen over die al puur statistisch te vinden zijn.

Antwoord ALLEEN met geldige JSON, zonder uitleg eromheen, in dit exacte formaat:
[{"dim": "compleetheid|juistheid|consistentie|actualiteit|uniciteit|plausibiliteit", "text": "regel in gewone taal", "sql": "voorbeeld SQL check"}]
Als je niets zinvols kunt toevoegen, geef dan een lege array terug: []`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Anthropic API-fout: ' + data.error.message }) };
    }

    const text = (data.content || []).map((b) => b.text || '').join('\n');
    const clean = text.replace(/```json|```/g, '').trim();

    let suggestions = [];
    try {
      suggestions = JSON.parse(clean);
      if (!Array.isArray(suggestions)) suggestions = [];
    } catch (e) {
      suggestions = [];
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestions })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
