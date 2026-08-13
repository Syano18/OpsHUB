export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Turnstile token is required' });
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    console.error('Missing TURNSTILE_SECRET_KEY environment variable');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    
    // Optionally include user IP if needed
    // const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    // formData.append('remoteip', ip);

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const outcome = await result.json();

    if (outcome.success) {
      return res.status(200).json({ success: true });
    } else {
      console.error('Turnstile verification failed:', outcome['error-codes']);
      return res.status(400).json({ success: false, error: 'Turnstile verification failed' });
    }
  } catch (error) {
    console.error('Error verifying Turnstile token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
