# QuaToBot: a Discord bot for Quaver

QuaToBot is a Discord bot used for real time interaction with the popular rythm game Quaver. With this bot, you can track every recent scores of all of the member of your server that have linked their account and much more !

## Installing

Simply click [this link](https://discord.com/api/oauth2/authorize?client_id=955200491636269126&permissions=414464657472&scope=bot) and select the server you want to add the bot to.
Please, don't forget to take a look at the documentation to learn how to setup the bot and how to properly use it !

## QNA
### What to do once the bot has been added to my server ?
The first thing that you need to do is to configure the permissions for each commands. This is very important as some commands could have some undesired effects, such as sending messages in channels that are not made for that !

You might want to select the bot language. This can be done using the command ``/set-language``. As of today, the only supported languages are English and French

Once this is done, you might want to start to track your users scores. Users can decide to track their score by first linking their Quaver accounts to the bot. This can be done using the ``/link-account`` command.

*Be aware that there are a few steps to go through to ensure that the account you're trying to link to is yours*

Scores recently played by users will be send in a channel if you have specified a channel where they can be sent. To set this channel, use the ``/set-channel`` command
You can also provide a channel where the sessions of linked players will be displayed using the same command. Note that you can display both scores and sessions in the same channel if you want to !

*A session will be displayed only if the user have at least played 5 maps. By default, the sessions will be displayed after 30 minutes of inactivity, but this can be configured using the command ``/edit-session``*

Users can also decide to set their own channel where they can display their score / sessions. This can be done using the ``/personal-channel set [player] [channel]`` and can be removed with the ``/personnal-channel unset`` command. Note that the player must be linked to the bot for him to be able to make a personnal channel.
