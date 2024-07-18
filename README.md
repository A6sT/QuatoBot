
# QuatoBot: a Discord bot for Quaver

QuatoBot is a Discord bot made for the Quato clan, used for real time interaction with the popular rythm game Quaver. This bot allows you to track recent scores and progress from every members of your server that have their account linked, and much more !

## Installation (for server admins)

Simply click [this link](https://discord.com/api/oauth2/authorize?client_id=955200491636269126&permissions=414464657472&scope=bot) and select the server you want to add the bot to.
#### What to do once the bot has been added to my server ?
The first thing that you need to do is to configure the permissions for each commands. This is very important as some commands could have some undesired effects, such as sending messages in channels that are not made for that !

You might want to select the bot language. This can be done using the command ``/set-language``. As of today, the only supported languages are English and French

Once this is done, you might want to start to track your users scores. Users can decide to track their score by first linking their Quaver accounts to the bot. This can be done using the ``/link-account`` command. If you're having trouble linking your account, you might want to look at the [QNA section](#how-do-i-link-my-quaver-profile-to-the-bot-?)

Scores recently played by users will be send in a channel if you have specified a channel where they can be sent. To set this channel, use the ``/set-channel`` command
You can also provide a channel where the sessions of linked players will be displayed using the same command. Note that you can display both scores and sessions in the same channel if you want to !

*A session will be displayed only if the user have at least played 5 maps. By default, the sessions will be displayed after 30 minutes of inactivity, but this can be configured using the command ``/edit-session``*

Users can also decide to set their own channel where they can display their score / sessions. This can be done using the ``/personal-channel set [player] [channel]`` and can be removed with the ``/personnal-channel unset`` command. Note that the player must be linked to the bot for him to be able to make a personnal channel.

## QNA
### How do I link my Quaver profile to the bot ?
To link your profile to the bot, the first thing that you need to do is to login on the Quaver website. Then, go to the settings section, and add your Discord tag under the Profile Information section. Save the modifications, then head on to Discord, and use the ``/link-account`` command.

### Why are some of my scores not registered ?
The scores made on unranked / unsubmitted map or with specific mods (aka mods that would prevent a score from being submitted to any ranked leaderboard) cannot be tracked by the bot anymore. 7K scores have also been temporarily disabled to lower API calls. (it is planned to be enabled once again in the future)

### How can I set a background image for my session's graph result ?
Using the ``/edit-session`` command, you will be able to edit few settings regarding your sessions. One of them is about the background image used for the session's graph. The ideal dimensions for the picture used are 500x300 (automaticaly scaled). You can find a template for the background image in the resource folder !

### How can I request new features for the bot ?
Simply open an issue describing what you want to add. If it is doable and I like the idea, I will start working on it on my free time.
