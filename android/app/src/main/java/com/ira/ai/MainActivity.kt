
package com.ira.ai

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.view.ViewGroup
import android.widget.*
import android.net.Uri
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import java.io.File
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private val executor = Executors.newSingleThreadExecutor()

    private var engine: Engine? = null
    private var conversation: com.google.ai.edge.litertlm.Conversation? = null

    private lateinit var status: TextView
    private lateinit var output: TextView
    private lateinit var input: EditText
    private lateinit var sendButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }

        layout.addView(TextView(this).apply {
            text = "Ira AI"
            textSize = 26f
        })

        status = TextView(this).apply {
            text = "Choose an AI model or avatar."
        }
        layout.addView(status)

        layout.addView(Button(this).apply {
            text = "Choose Local AI Model"
            setOnClickListener {
                chooseFile(1001)
            }
        })

        layout.addView(Button(this).apply {
            text = "Choose VRM Avatar"
            setOnClickListener {
                chooseFile(1002)
            }
        })

        output = TextView(this).apply {
            text = "Welcome! I'm Ira."
            textSize = 16f
        }

        layout.addView(
            output,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        )

        input = EditText(this).apply {
            hint = "Message Ira..."
        }
        layout.addView(input)

        sendButton = Button(this).apply {
            text = "Send"
            isEnabled = false
            setOnClickListener { sendMessage() }
        }
        layout.addView(sendButton)

        setContentView(layout)
    }

    private fun chooseFile(requestCode: Int) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type = "*/*"
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        startActivityForResult(intent, requestCode)
    }

    @Deprecated("Legacy file picker callback")
    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        super.onActivityResult(requestCode, resultCode, data)

        if (resultCode != RESULT_OK) return

        val uri = data?.data ?: return

        when (requestCode) {
            1001 -> {
                if (!uri.toString().substringBefore("?")
                        .lowercase().endsWith(".litertlm")) {
                    status.text = "Please select a .litertlm AI model."
                    return
                }
                loadModel(uri)
            }

            1002 -> {
                if (!uri.toString().substringBefore("?")
                        .lowercase().endsWith(".vrm")) {
                    status.text = "Please select a .vrm avatar file."
                    return
                }
                status.text = "VRM selected. Avatar renderer integration is still needed."
                output.text = "Selected avatar: ${uri.lastPathSegment ?: "VRM file"}"
            }
        }
    }

    private fun loadModel(uri: Uri) {
        status.text = "Loading model..."

        executor.execute {
            var newEngine: Engine? = null

            try {
                val modelFile = File(filesDir, "ira-model.litertlm")

                contentResolver.openInputStream(uri).use { stream ->
                    requireNotNull(stream) {
                        "Could not open selected file."
                    }
                    modelFile.outputStream().use {
                        stream.copyTo(it)
                    }
                }

                newEngine = Engine(
                    EngineConfig(
                        modelPath = modelFile.absolutePath,
                        backend = Backend.CPU(),
                        cacheDir = cacheDir.absolutePath
                    )
                )

                newEngine.initialize()

                val newConversation = newEngine.createConversation()

                val oldConversation = conversation
                val oldEngine = engine

                conversation = newConversation
                engine = newEngine
                newEngine = null

                oldConversation?.close()
                oldEngine?.close()

                runOnUiThread {
                    status.text = "Local AI ready!"
                    sendButton.isEnabled = true
                }

            } catch (error: Exception) {
                newEngine?.close()

                runOnUiThread {
                    status.text = "Model loading failed: ${error.message ?: "Unknown error"}"
                }
            }
        }
    }

    private fun sendMessage() {
        val message = input.text.toString().trim()
        if (message.isEmpty() || conversation == null) return

        sendButton.isEnabled = false
        status.text = "Ira is thinking..."

        executor.execute {
            try {
                val reply = conversation!!.sendMessage(message).toString()

                runOnUiThread {
                    output.text = "You: $message\n\nIra: $reply"
                    input.text.clear()
                    status.text = "Local AI ready"
                    sendButton.isEnabled = true
                }

            } catch (error: Exception) {
                runOnUiThread {
                    status.text = "AI error: ${error.message ?: "Unknown error"}"
                    sendButton.isEnabled = true
                }
            }
        }
    }

    override fun onDestroy() {
        executor.execute {
            conversation?.close()
            conversation = null
            engine?.close()
            engine = null
        }

        executor.shutdown()
        super.onDestroy()
    }
}
